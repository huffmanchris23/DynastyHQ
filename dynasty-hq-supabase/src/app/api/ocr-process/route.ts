import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { getSupabase } from '@/lib/supabaseClient';
import {
  getCurrentContext,
  guideScreenType,
  dynastyIdFor,
  contextColumnsFor,
  sniffImageMediaType,
  USER_ID,
  SCREEN_TYPES,
  type ScreenType,
} from '@/lib/ocrShared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

const MODEL = 'claude-haiku-4-5-20251001';
const TEAM_NAME_FIELDS = ['team', 'opponent', 'home_team', 'away_team', 'favorite'];

interface GuideRow {
  screen_type: string;
  target_table: string;
  match_keys: string[];
  name_variant_column: string | null;
  field_map: Record<string, string>;
  extraction_rules: string;
}

export async function POST() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY is missing from this Vercel project\u2019s environment variables.' }, { status: 500 });
  }

  const sb = getSupabase();
  const anthropic = new Anthropic({ apiKey });

  let ctx;
  try {
    ctx = await getCurrentContext();
  } catch (err: any) {
    return NextResponse.json({ error: `Couldn't resolve current week: ${err?.message || err}` }, { status: 500 });
  }

  const { data: guides, error: guidesErr } = await sb.from('ocr_screen_guides').select('*').eq('active', true);
  if (guidesErr) return NextResponse.json({ error: `ocr_screen_guides: ${guidesErr.message}` }, { status: 500 });
  const guideByType = new Map<string, GuideRow>((guides || []).map((g: any) => [g.screen_type, g]));

  const { data: helperRows, error: helperErr } = await sb
    .from('ocr_helper')
    .select('team_name, name_in_schedule, name_in_polls, name_in_playoffs, name_in_stats, name_in_preview, name_in_betting');
  if (helperErr) return NextResponse.json({ error: `ocr_helper: ${helperErr.message}` }, { status: 500 });

  const { data: previewRows, error: previewErr } = await sb
    .from('game_preview')
    .select('team')
    .eq('current_week', true)
    .limit(1);
  if (previewErr) return NextResponse.json({ error: `game_preview: ${previewErr.message}` }, { status: 500 });
  const myTeamName = previewRows?.[0]?.team || null;

  const prefix = `w${ctx.week}_`;
  const { data: files, error: listErr } = await sb.storage.from(ctx.bucket).list('', { limit: 100 });
  if (listErr) return NextResponse.json({ error: `Couldn't list bucket "${ctx.bucket}": ${listErr.message}` }, { status: 500 });
  const weekFiles = (files || []).filter((f) => f.name.startsWith(prefix) && f.name.endsWith('.png'));

  if (weekFiles.length === 0) {
    return NextResponse.json({ season: ctx.season, week: ctx.week, results: [], message: 'No screenshots uploaded for this week yet.' });
  }

  const summary: any[] = [];

  for (const file of weekFiles) {
    const slot = file.name.slice(prefix.length, -'.png'.length) as ScreenType;
    if (!SCREEN_TYPES.includes(slot)) {
      summary.push({ file: file.name, status: 'skipped', reason: 'unrecognized slot in filename' });
      continue;
    }
    const guideType = guideScreenType(slot);
    const guide = guideByType.get(guideType);
    if (!guide) {
      summary.push({ file: file.name, status: 'skipped', reason: `no active ocr_screen_guides row for "${guideType}"` });
      continue;
    }

    const result = await processOneImage({ sb, anthropic, bucket: ctx.bucket, fileName: file.name, slot, guide, helperRows: helperRows || [], myTeamName, ctx });
    summary.push({ file: file.name, screen_type: guide.screen_type, ...result });

    await sb.from('ocr_audit_log').insert({
      season: ctx.season,
      week: ctx.week,
      screen_type: guide.screen_type,
      file_path: file.name,
      status: result.status,
      rows_written: result.rowsWritten || 0,
      raw_response: result.rawResponse || null,
      error_message: result.error || (result.issues && result.issues.length ? result.issues.join(' | ').slice(0, 4000) : null),
    });
  }

  return NextResponse.json({ season: ctx.season, week: ctx.week, results: summary });
}

async function processOneImage({
  sb,
  anthropic,
  bucket,
  fileName,
  slot,
  guide,
  helperRows,
  myTeamName,
  ctx,
}: {
  sb: ReturnType<typeof getSupabase>;
  anthropic: Anthropic;
  bucket: string;
  fileName: string;
  slot: string;
  guide: GuideRow;
  helperRows: any[];
  myTeamName: string | null;
  ctx: { season: number; week: number };
}): Promise<{ status: string; rowsWritten?: number; rawResponse?: string; error?: string; issues?: string[] }> {
  const { data: blob, error: dlErr } = await sb.storage.from(bucket).download(fileName);
  if (dlErr) return { status: 'skipped_failed', error: `download: ${dlErr.message}` };

  const arrayBuffer = await blob.arrayBuffer();
  const imageBuffer = Buffer.from(arrayBuffer);
  const imageBase64 = imageBuffer.toString('base64');
  const mediaType = sniffImageMediaType(imageBuffer);

  const variantCol = guide.name_variant_column;
  const nameOptions = helperRows.map((r) => (variantCol ? r[variantCol] || r.team_name : r.team_name));
  const variantToCanonical: Record<string, string> = {};
  helperRows.forEach((r) => {
    const key = variantCol ? r[variantCol] || r.team_name : r.team_name;
    variantToCanonical[key] = r.team_name;
  });

  const isMyTeamOnlyPart = /_2$/.test(slot) && (guide.screen_type === 'stats_offense' || guide.screen_type === 'stats_defense');
  const partNote = isMyTeamOnlyPart
    ? '\n\nIMPORTANT — this is the SECOND screenshot for this category, only sent when Chris\u2019s own team wasn\u2019t visible in the first (top-group) screenshot. This screenshot shows ONLY his team, scrolled to find it. Extract exactly ONE row: his team\u2019s row, with whatever national_rank and stats are shown for it. Do not include any other team, even if one is partially visible at the edge of the screen.'
    : '';

  const systemPrompt = `You extract structured data from a single College Football 27 screenshot for Dynasty HQ, a personal dynasty tracker.

Screen type: ${guide.screen_type}

Rules for this screen:
${guide.extraction_rules}${partNote}

Every team name you output must be copied EXACTLY from this list of known values — do not invent, abbreviate, or reformat a name that isn't already on this list:
${nameOptions.join(', ')}

Output ONLY a JSON array (no markdown fences, no prose before or after) of objects. Each object must have exactly these keys: ${Object.keys(guide.field_map).join(', ')}.
Numeric fields must be JSON numbers, not quoted strings. If a value isn't visible or legible in the screenshot, use null for that field rather than guessing or fabricating a number.`;

  let lastErr = '';
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const msg = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 2048,
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageBase64 } },
              { type: 'text', text: 'Extract the data per the rules above.' },
            ],
          },
        ],
      });

      const textBlock = msg.content.find((b: any) => b.type === 'text') as any;
      const raw = (textBlock?.text || '').trim();
      const cleaned = raw.replace(/^```json\s*|```\s*$/g, '').trim();
      const rows = JSON.parse(cleaned);
      if (!Array.isArray(rows)) throw new Error('Model did not return a JSON array.');

      // For a "my team only" second screenshot, don't trust the model to
      // self-limit to one row — a scrolled-to view often has neighboring
      // ranks still visible, and the model sometimes includes them despite
      // the instruction above. Filter to the matching team server-side.
      let finalRows = rows;
      if (isMyTeamOnlyPart && myTeamName) {
        const myVariant = variantCol ? helperRows.find((r: any) => r.team_name === myTeamName)?.[variantCol] || myTeamName : myTeamName;
        const norm = (s: any) => String(s || '').trim().toLowerCase();
        finalRows = rows.filter((r: any) => norm(r.team) === norm(myVariant) || norm(r.team) === norm(myTeamName));
        if (!finalRows.length) finalRows = rows.slice(0, 1); // fallback rather than silently writing nothing
      }

      const { written, issues } = await writeRows({ sb, guide, rows: finalRows, variantToCanonical, ctx });
      return {
        status: attempt === 0 ? 'success' : 'retried_success',
        rowsWritten: written,
        rawResponse: raw.slice(0, 4000),
        issues: issues.length ? issues.slice(0, 10) : undefined,
      };
    } catch (err: any) {
      lastErr = err?.message || String(err);
    }
  }
  return { status: 'skipped_failed', error: lastErr };
}

async function writeRows({
  sb,
  guide,
  rows,
  variantToCanonical,
  ctx,
}: {
  sb: ReturnType<typeof getSupabase>;
  guide: GuideRow;
  rows: any[];
  variantToCanonical: Record<string, string>;
  ctx: { season: number; week: number };
}): Promise<{ written: number; issues: string[] }> {
  const cols = contextColumnsFor(guide.target_table);
  let written = 0;
  const issues: string[] = [];

  for (const row of rows) {
    const mapped: Record<string, any> = {};
    for (const [screenField, column] of Object.entries(guide.field_map)) {
      mapped[column] = row[screenField] ?? null;
    }

    for (const field of TEAM_NAME_FIELDS) {
      if (mapped[field] && variantToCanonical[mapped[field]]) {
        mapped[field] = variantToCanonical[mapped[field]];
      }
    }

    mapped.user_id = USER_ID;
    mapped.dynasty_id = dynastyIdFor(guide.target_table);

    // Season is constant for the whole screenshot — always stamp it from
    // the run's context. Week is NOT constant for every guide: team_schedule
    // spans many different weeks in one screenshot, so its week comes from
    // each row's own on-screen number (captured above via field_map, key
    // "week") rather than the run's current week. Every other guide's rows
    // all belong to the same current week, so those get stamped from ctx.
    mapped[cols.seasonCol] = cols.seasonValue(ctx.season);
    if (guide.target_table === 'team_schedule') {
      if (mapped.week === null || mapped.week === undefined || isNaN(Number(mapped.week))) {
        issues.push(`row skipped — no usable "week" number in the model's output: ${JSON.stringify(row)}`);
        continue;
      }
      mapped[cols.weekCol] = cols.weekValue(Number(mapped.week));
      delete mapped.week; // not a real column — week_name is
    } else {
      mapped[cols.weekCol] = cols.weekValue(ctx.week);
    }

    if (guide.screen_type === 'stats_offense') mapped.offense_or_defense_stat = 'offense';
    if (guide.screen_type === 'stats_defense') mapped.offense_or_defense_stat = 'defense';

    let query = sb.from(guide.target_table).select('id');
    for (const key of guide.match_keys) {
      if (mapped[key] === undefined || mapped[key] === null) {
        issues.push(`row skipped — match key "${key}" is missing: ${JSON.stringify(row)}`);
        query = null as any;
        break;
      }
      query = query.eq(key, mapped[key]);
    }
    if (!query) continue;

    const { data: existing, error: findErr } = await query.limit(1);
    if (findErr) {
      issues.push(`find failed on ${JSON.stringify(row)}: ${findErr.message}`);
      continue;
    }

    if (existing && existing[0]) {
      const { error: updErr } = await sb.from(guide.target_table).update(mapped).eq('id', existing[0].id);
      if (updErr) issues.push(`update failed on ${JSON.stringify(row)}: ${updErr.message}`);
      else written++;
    } else {
      const { error: insErr } = await sb.from(guide.target_table).insert(mapped);
      if (insErr) issues.push(`insert failed on ${JSON.stringify(row)}: ${insErr.message}`);
      else written++;
    }
  }

  return { written, issues };
}
