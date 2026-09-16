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

    const result = await processOneImage({ sb, anthropic, bucket: ctx.bucket, fileName: file.name, guide, helperRows: helperRows || [], ctx });
    summary.push({ file: file.name, screen_type: guide.screen_type, ...result });

    await sb.from('ocr_audit_log').insert({
      season: ctx.season,
      week: ctx.week,
      screen_type: guide.screen_type,
      file_path: file.name,
      status: result.status,
      rows_written: result.rowsWritten || 0,
      raw_response: result.rawResponse || null,
      error_message: result.error || null,
    });
  }

  return NextResponse.json({ season: ctx.season, week: ctx.week, results: summary });
}

async function processOneImage({
  sb,
  anthropic,
  bucket,
  fileName,
  guide,
  helperRows,
  ctx,
}: {
  sb: ReturnType<typeof getSupabase>;
  anthropic: Anthropic;
  bucket: string;
  fileName: string;
  guide: GuideRow;
  helperRows: any[];
  ctx: { season: number; week: number };
}): Promise<{ status: string; rowsWritten?: number; rawResponse?: string; error?: string }> {
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

  const systemPrompt = `You extract structured data from a single College Football 27 screenshot for Dynasty HQ, a personal dynasty tracker.

Screen type: ${guide.screen_type}

Rules for this screen:
${guide.extraction_rules}

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

      const written = await writeRows({ sb, guide, rows, variantToCanonical, ctx });
      return { status: attempt === 0 ? 'success' : 'retried_success', rowsWritten: written, rawResponse: raw.slice(0, 4000) };
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
}): Promise<number> {
  const cols = contextColumnsFor(guide.target_table);
  let count = 0;

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
    mapped[cols.seasonCol] = cols.seasonValue(ctx.season);
    mapped[cols.weekCol] = cols.weekValue(ctx.week);
    if (guide.screen_type === 'stats_offense') mapped.offense_or_defense_stat = 'offense';
    if (guide.screen_type === 'stats_defense') mapped.offense_or_defense_stat = 'defense';

    let query = sb.from(guide.target_table).select('id');
    for (const key of guide.match_keys) {
      query = query.eq(key, mapped[key]);
    }
    const { data: existing, error: findErr } = await query.limit(1);
    if (findErr) continue; // leave this one row unwritten rather than abort the whole batch

    if (existing && existing[0]) {
      const { error: updErr } = await sb.from(guide.target_table).update(mapped).eq('id', existing[0].id);
      if (!updErr) count++;
    } else {
      const { error: insErr } = await sb.from(guide.target_table).insert(mapped);
      if (!insErr) count++;
    }
  }

  return count;
}
