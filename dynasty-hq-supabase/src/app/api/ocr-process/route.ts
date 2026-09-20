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
import { computeMatchupOdds } from '@/lib/engines/odds';
import { assignBroadcasts, type SlateGame, type SlateTeam } from '@/lib/engines/broadcast';
import { buildContentSystemPrompt, parseContentResponse, DRIVE_BY_TYPE, TOP_TAKE_TYPE } from '@/lib/engines/content';

const CONTENT_MODEL = 'claude-sonnet-5';

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
    .select(
      'team_name, name_in_schedule, name_in_polls, name_in_playoffs, name_in_stats, name_in_preview, name_in_betting, overall_rating, offense_rating, defense_rating, home_state'
    );
  if (helperErr) return NextResponse.json({ error: `ocr_helper: ${helperErr.message}` }, { status: 500 });

  // Ratings + home state, keyed by canonical team_name — the odds engine
  // needs these for whichever two teams a given best_matchups row names.
  const ratingsByName: Record<string, { overall: number; offense: number; defense: number; homeState: string | null }> = {};
  (helperRows || []).forEach((r: any) => {
    ratingsByName[r.team_name] = {
      overall: Number(r.overall_rating),
      offense: Number(r.offense_rating),
      defense: Number(r.defense_rating),
      homeState: r.home_state || null,
    };
  });

  const { data: assetRows, error: assetErr } = await sb.from('assets').select('team_name, team_conference');
  if (assetErr) return NextResponse.json({ error: `assets: ${assetErr.message}` }, { status: 500 });
  const conferenceByName: Record<string, string | null> = {};
  (assetRows || []).forEach((r: any) => {
    conferenceByName[r.team_name] = r.team_conference || null;
  });

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
  let touchedBestMatchup = false;
  let touchedResults = false;

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
    if (guide.screen_type === 'best_matchup') touchedBestMatchup = true;
    if (guide.screen_type === 'last_week_results') touchedResults = true;

    const result = await processOneImage({ sb, anthropic, bucket: ctx.bucket, fileName: file.name, slot, guide, helperRows: helperRows || [], ratingsByName, myTeamName, ctx });
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

  let broadcastSummary: any = null;
  if (touchedBestMatchup) {
    broadcastSummary = await runBroadcastEngine({ sb, ctx, ratingsByName, conferenceByName });
  }

  let contentSummary: any = null;
  if (touchedResults) {
    contentSummary = await runContentEngine({ sb, anthropic, ctx });
  }

  return NextResponse.json({ season: ctx.season, week: ctx.week, results: summary, broadcast: broadcastSummary, content: contentSummary });
}

// Gathers every relevant data source for the week (not just the new
// last_week_results screenshot — the Top 25, this week's best_matchups,
// Heisman race, coaching hot seats, and conference standings too), asks
// Claude to write this week's Dynasty Drive-By + T.B.'s Top 3 Takes, and
// writes the results into `content`. Deletes this week's existing rows of
// those two types first so re-running (e.g. a corrected screenshot) is
// idempotent rather than piling up duplicates.
async function runContentEngine({
  sb,
  anthropic,
  ctx,
}: {
  sb: ReturnType<typeof getSupabase>;
  anthropic: Anthropic;
  ctx: { season: number; week: number };
}) {
  const [lastWeekResults, currentTop25, biggestGamesThisWeek, heismanRace, coachingHotSeats, conferenceStandings] = await Promise.all([
    sb.from('weekly_results').select('home_team, away_team, home_score, away_score, home_rank, away_rank').eq('season', ctx.season).eq('week', ctx.week - 1),
    sb.from('ap_poll').select('rank, team, wins, losses').eq('season', ctx.season).eq('week', String(ctx.week)),
    sb.from('best_matchups').select('home_team, away_team, home_rank, away_rank, favorite, spread, favorite_moneyline, total_over_under, broadcast, game_date, time').eq('season', ctx.season).eq('week', ctx.week),
    sb.from('heisman_trophy').select('rank, name, team, position, class').eq('season', ctx.season).eq('week', ctx.week),
    sb.from('coaching_hotseats').select('team, coach, job_security').eq('season', ctx.season).eq('week', ctx.week),
    sb.from('conference_standings').select('team, overall_wins, overall_losses, conference_wins, conference_losses').eq('season', String(ctx.season)),
  ]);

  const firstError = [lastWeekResults, currentTop25, biggestGamesThisWeek, heismanRace, coachingHotSeats, conferenceStandings].find((r) => r.error)?.error;
  if (firstError) return { error: `content engine data fetch failed: ${firstError.message}` };

  const context = {
    lastWeekResults: lastWeekResults.data || [],
    currentTop25: currentTop25.data || [],
    biggestGamesThisWeek: biggestGamesThisWeek.data || [],
    heismanRace: heismanRace.data || [],
    coachingHotSeats: coachingHotSeats.data || [],
    conferenceStandings: conferenceStandings.data || [],
  };

  if (context.lastWeekResults.length === 0 && context.currentTop25.length === 0) {
    return { skipped: true, reason: 'no usable data found for this week' };
  }

  let raw: string;
  try {
    const msg = await anthropic.messages.create({
      model: CONTENT_MODEL,
      max_tokens: 2048,
      system: buildContentSystemPrompt(context),
      messages: [{ role: 'user', content: "Write this week's Dynasty Drive-By and T.B.'s Top 3 Takes per the rules above." }],
    });
    const textBlock = msg.content.find((b: any) => b.type === 'text') as any;
    raw = (textBlock?.text || '').trim();
  } catch (err: any) {
    return { error: `content engine API call failed: ${err?.message || err}` };
  }

  let parsed;
  try {
    parsed = parseContentResponse(raw);
  } catch (err: any) {
    return { error: `content engine couldn't parse the model's output: ${err?.message || err}`, rawResponse: raw };
  }

  const { error: delErr } = await sb
    .from('content')
    .delete()
    .eq('season', ctx.season)
    .eq('week', String(ctx.week))
    .in('content_input_type', [DRIVE_BY_TYPE, TOP_TAKE_TYPE]);
  if (delErr) return { error: `content engine failed clearing old rows: ${delErr.message}` };

  const rows = [
    ...parsed.driveBy.map((item) => ({ season: ctx.season, week: String(ctx.week), content_input_type: DRIVE_BY_TYPE, team: item.team, headline: item.headline })),
    ...parsed.topTakes.map((item) => ({ season: ctx.season, week: String(ctx.week), content_input_type: TOP_TAKE_TYPE, team: item.team, headline: item.headline })),
  ];

  const { error: insErr } = await sb.from('content').insert(rows);
  if (insErr) return { error: `content engine write failed: ${insErr.message}` };

  return { written: rows.length, driveBy: parsed.driveBy.length, topTakes: parsed.topTakes.length };
}

// Re-scores broadcast assignments across the WHOLE week's slate at once
// (all 5 best_matchups games plus Mr. Huffman's own game_preview game, if
// that week's row already has team/opponent/game_time filled in) — network
// picks depend on which other games share a time slot, so this can't run
// per-file the way the odds engine does. Always recomputes from what's
// currently in the DB for this season/week, so it's safe to re-run on
// every "Process Week" batch that touched a best_matchup screenshot.
async function runBroadcastEngine({
  sb,
  ctx,
  ratingsByName,
  conferenceByName,
}: {
  sb: ReturnType<typeof getSupabase>;
  ctx: { season: number; week: number };
  ratingsByName: Record<string, { overall: number; offense: number; defense: number; homeState: string | null }>;
  conferenceByName: Record<string, string | null>;
}) {
  const toSlateTeam = (name: string | null): SlateTeam | null => {
    if (!name) return null;
    const r = ratingsByName[name];
    if (!r) return null;
    return { name, overall: r.overall, conference: conferenceByName[name] ?? null };
  };

  const games: SlateGame[] = [];
  const issues: string[] = [];

  const { data: matchupRows, error: matchupErr } = await sb
    .from('best_matchups')
    .select('id, home_team, away_team, time')
    .eq('season', ctx.season)
    .eq('week', ctx.week);
  if (matchupErr) return { error: `best_matchups: ${matchupErr.message}` };

  (matchupRows || []).forEach((row: any) => {
    const home = toSlateTeam(row.home_team);
    const away = toSlateTeam(row.away_team);
    if (!home || !away) {
      issues.push(`best_matchups row ${row.id} skipped — missing ratings for "${row.home_team}"/"${row.away_team}"`);
      return;
    }
    games.push({ id: `best_matchups:${row.id}`, homeTeam: home, awayTeam: away, time: row.time });
  });

  const { data: previewRows, error: previewErr } = await sb
    .from('game_preview')
    .select('id, team, opponent, home_team, game_time')
    .eq('season', ctx.season)
    .eq('current_week', true)
    .limit(1);
  if (previewErr) return { error: `game_preview: ${previewErr.message}` };

  const preview = previewRows?.[0];
  if (preview && preview.team && preview.opponent && preview.game_time) {
    const homeName = preview.home_team || preview.team;
    const awayName = homeName === preview.team ? preview.opponent : preview.team;
    const home = toSlateTeam(homeName);
    const away = toSlateTeam(awayName);
    if (home && away) {
      games.push({ id: `game_preview:${preview.id}`, homeTeam: home, awayTeam: away, time: preview.game_time });
    } else {
      issues.push(`game_preview row ${preview.id} skipped — missing ratings for "${homeName}"/"${awayName}"`);
    }
  }

  if (games.length === 0) return { assigned: 0, issues };

  const assignments = assignBroadcasts(games);

  for (const a of assignments) {
    const [table, idStr] = a.id.split(':');
    const id = Number(idStr);
    const column = table === 'game_preview' ? 'game_broadcast' : 'broadcast';
    const { error } = await sb.from(table).update({ [column]: a.broadcast }).eq('id', id);
    if (error) issues.push(`broadcast write failed for ${a.id}: ${error.message}`);
  }

  return { assigned: assignments.length, issues };
}

async function processOneImage({
  sb,
  anthropic,
  bucket,
  fileName,
  slot,
  guide,
  helperRows,
  ratingsByName,
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
  ratingsByName: Record<string, { overall: number; offense: number; defense: number; homeState: string | null }>;
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

      const { written, issues } = await writeRows({ sb, guide, rows: finalRows, variantToCanonical, ctx, slot, ratingsByName });
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
  slot,
  ratingsByName,
}: {
  sb: ReturnType<typeof getSupabase>;
  guide: GuideRow;
  rows: any[];
  variantToCanonical: Record<string, string>;
  ctx: { season: number; week: number };
  slot: string;
  ratingsByName: Record<string, { overall: number; offense: number; defense: number; homeState: string | null }>;
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

    // best_matchup_1..5 slots each own exactly one best_matchups row for
    // the week, keyed by this number rather than by team names — team
    // names alone aren't a stable match key here because the odds engine
    // (below) doesn't rewrite home_team/away_team, so nothing about this
    // row's team columns is guaranteed to match what a prior week's guess
    // might have written.
    if (guide.screen_type === 'best_matchup') {
      const slotMatch = /_(\d+)$/.exec(slot);
      if (!slotMatch) {
        issues.push(`row skipped — couldn't read a matchup number from slot "${slot}"`);
        continue;
      }
      mapped.matchup_number = Number(slotMatch[1]);
    }

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

    let rowId: any = existing && existing[0] ? existing[0].id : null;

    if (rowId) {
      const { error: updErr } = await sb.from(guide.target_table).update(mapped).eq('id', rowId);
      if (updErr) {
        issues.push(`update failed on ${JSON.stringify(row)}: ${updErr.message}`);
        continue;
      }
      written++;
    } else {
      const { data: inserted, error: insErr } = await sb.from(guide.target_table).insert(mapped).select('id').limit(1);
      if (insErr) {
        issues.push(`insert failed on ${JSON.stringify(row)}: ${insErr.message}`);
        continue;
      }
      written++;
      rowId = inserted?.[0]?.id ?? null;
    }

    if (guide.screen_type === 'best_matchup' && rowId) {
      const oddsIssue = await applyOddsEngine({ sb, rowId, mapped, ratingsByName });
      if (oddsIssue) issues.push(oddsIssue);
    }
  }

  return { written, issues };
}

// Runs the deterministic odds engine (src/lib/engines/odds.ts) against a
// just-written best_matchups row and writes the result straight back onto
// the same row. Ratings-lookup failures are reported as issues rather than
// thrown — a missing rating shouldn't take down the rest of the week's
// batch, it should just leave that one row's odds fields untouched (null)
// so it's obviously incomplete rather than silently wrong.
async function applyOddsEngine({
  sb,
  rowId,
  mapped,
  ratingsByName,
}: {
  sb: ReturnType<typeof getSupabase>;
  rowId: any;
  mapped: Record<string, any>;
  ratingsByName: Record<string, { overall: number; offense: number; defense: number; homeState: string | null }>;
}): Promise<string | null> {
  const homeName = mapped.home_team;
  const awayName = mapped.away_team;
  const homeRatings = ratingsByName[homeName];
  const awayRatings = ratingsByName[awayName];

  if (!homeName || !awayName || !homeRatings || !awayRatings) {
    return `odds engine skipped for row ${rowId} — missing ratings for "${homeName}" and/or "${awayName}"`;
  }

  const odds = computeMatchupOdds({
    homeTeam: { name: homeName, ...homeRatings },
    awayTeam: { name: awayName, ...awayRatings },
    connector: mapped.connector,
    gameLocation: mapped.game_location,
    homeWins: Number(mapped.home_wins ?? 0),
    homeLosses: Number(mapped.home_losses ?? 0),
    awayWins: Number(mapped.away_wins ?? 0),
    awayLosses: Number(mapped.away_losses ?? 0),
  });

  const { error } = await sb
    .from('best_matchups')
    .update({
      is_neutral_site: odds.isNeutralSite,
      home_field_team: odds.homeFieldTeam,
      favorite: odds.favorite,
      spread: odds.spread,
      favorite_win_probability: odds.favoriteWinProbability,
      favorite_moneyline: odds.favoriteMoneyline,
      total_over_under: odds.totalOverUnder,
    })
    .eq('id', rowId);

  return error ? `odds engine write failed for row ${rowId}: ${error.message}` : null;
}
