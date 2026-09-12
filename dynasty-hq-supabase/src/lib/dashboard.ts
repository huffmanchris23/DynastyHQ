/**
 * ============================== DASHBOARD AGGREGATOR ==============================
 * Replaces the old sheets.ts + parsers.ts + dashboard.ts trio. Queries
 * Supabase directly instead of parsing a positional grid — most of the old
 * parsing logic (fixed row ranges, column offsets, GM{n} loops) simply isn't
 * needed anymore because the data already lives in real columns.
 *
 * DashboardData's shape is kept as close as possible to the original so the
 * tab components didn't need to change. The two real exceptions are the
 * `Preview` interface (see types.ts) and Home.tsx's next-game card, because
 * game_preview genuinely has a different shape than the old Preview tab.
 */

import { getSupabase } from './supabaseClient';
import type {
  DashboardData,
  TeamAsset,
  Recap,
  Preview,
  Schedule,
  Top25Game,
  PollEntry,
  Playoff,
  ConfRow,
  TeamStats,
  TeamStatsSplit,
  Recruit,
  Roster,
  Coach,
  Awards,
  MyCoach,
  Content,
  StoryBriefItem,
} from './types';

function safeNum(v: any, fallback = 0): number {
  const n = Number(v);
  return isNaN(n) ? fallback : n;
}

// game_preview.week uses plain numbers for the regular season ("0".."14")
// but text labels for postseason stages ("Conference Championships",
// "Bowl Week 1", etc.) — every other week-scoped table (ap_poll, team_stats,
// top_25_schedule, playoff_rankings, coaching_hotseats, heisman_trophy,
// passing/rushing/receiving, conference_standings) still expects a plain
// integer in its own `week` column. This is the single mapping between the
// two, so postseason weeks resolve to the same number everywhere.
const POSTSEASON_WEEK_MAP: Record<string, number> = {
  'conference championships': 15,
  'bowl week 1': 16,
  'bowl week 2': 17,
  'bowl week 3': 18,
  'national championship': 19,
};

function resolveStatsWeek(label: any): number {
  const raw = String(label ?? '').trim();
  const mapped = POSTSEASON_WEEK_MAP[raw.toLowerCase()];
  return mapped !== undefined ? mapped : safeNum(raw, 0);
}

// Postseason rows display as their sequential week number plus a suffix
// symbol marking the game type (legend rendered in Schedule.tsx):
//   * = Conference Championship, + = Bowl Game, ^ = CFB Playoff Game
// Hoisted to module level (not just inside fetchDashboardData) so both the
// schedule-building code AND the recap fallback below can reverse-map a
// numeric week back to the team_schedule.week_name label that produced it.
const POSTSEASON_LABELS: Record<string, { suffix: string; sortWeek: number }> = {
  conference_championship: { suffix: '*', sortWeek: 15 },
  bowl_game: { suffix: '+', sortWeek: 16 },
  playoff_round_1: { suffix: '^', sortWeek: 16 },
  playoff_quarterfinals: { suffix: '^', sortWeek: 17 },
  playoff_semifinals: { suffix: '^', sortWeek: 18 },
  national_championship: { suffix: '^', sortWeek: 19 },
};

// Reverse of the week_name -> sortWeek mapping above, for a single
// team_schedule row: 'week_7' -> 7, 'playoff_quarterfinals' -> 17, etc.
// Returns null for byes/anything unrecognized.
function sortWeekForScheduleRow(row: any): number | null {
  const label = String(row?.week_name || '').toLowerCase();
  const weekMatch = label.match(/^week_(\d+)$/);
  if (weekMatch) return safeNum(weekMatch[1]);
  const meta = POSTSEASON_LABELS[label];
  return meta ? meta.sortWeek : null;
}

// Human-readable label for the very top of the app ("Dynasty HQ — X") —
// negative weeks predate the real schedule entirely ("Preseason"), rather
// than literally printing "Week -1". For postseason weeks, checks the
// actual team_schedule row first (since bowl_game/playoff_round_1 share the
// same sortWeek and only one will actually exist for a given team).
function displayWeekLabel(week: number, scheduleRows: any[]): string {
  if (week < 0) return 'Preseason';
  if (week <= 14) return `Week ${week}`;
  const matchedRow = scheduleRows.find((r: any) => sortWeekForScheduleRow(r) === week);
  const matchedLabel = matchedRow ? String(matchedRow.week_name || '').toLowerCase() : null;
  const resolvedLabel =
    matchedLabel && POSTSEASON_LABELS[matchedLabel]
      ? matchedLabel
      : Object.keys(POSTSEASON_LABELS).find((k) => POSTSEASON_LABELS[k].sortWeek === week);
  return resolvedLabel ? toTitleCase(resolvedLabel.replace(/_/g, ' ')) : `Week ${week}`;
}

function norm(s: any): string {
  return String(s || '').trim().toLowerCase();
}

// Normalizes team_schedule.w_or_l to a plain 'W'/'L' regardless of whether
// it was entered as "W"/"L" (the convention everywhere else in the app —
// display strings, Career History suffixes, etc.) or spelled out as
// "WIN"/"LOSS". Anything else (blank, TBD) is null — game not yet decided.
function normResult(v: any): 'W' | 'L' | null {
  const s = String(v || '').trim().toUpperCase();
  if (!s) return null;
  if (s === 'W' || s.startsWith('WIN')) return 'W';
  if (s === 'L' || s.startsWith('LOSS') || s.startsWith('LOSE')) return 'L';
  return null;
}

function toTitleCase(s: string): string {
  return s.toLowerCase().replace(/(^|\s)([a-z])/g, (_m, p1, p2) => p1 + p2.toUpperCase());
}

/* ============================== ASSET LOOKUP ============================== */

function toTeamAsset(row: any): TeamAsset {
  return {
    TEAM_ABBREVIATION: row.team_abbreviation,
    TEAM_NAME: row.team_name,
    TEAM_MASCOT: row.team_mascot,
    TEAM_CONFERENCE: row.team_conference,
    CITY: row.city,
    STATE: row.state,
    PRIMARY_COLOR: row.primary_color,
    SECONDARY_COLOR: row.secondary_color,
    LOGO_URL: row.logo_url,
  };
}

interface AssetIndex {
  byName: Map<string, TeamAsset>;
  byAbbr: Map<string, TeamAsset>;
}

function buildAssetIndex(rows: any[]): AssetIndex {
  const byName = new Map<string, TeamAsset>();
  const byAbbr = new Map<string, TeamAsset>();
  rows.forEach((r) => {
    const asset = toTeamAsset(r);
    if (r.team_name) byName.set(norm(r.team_name), asset);
    if (r.team_abbreviation) byAbbr.set(norm(r.team_abbreviation), asset);
  });
  return { byName, byAbbr };
}

// Team names are cased inconsistently across tables (some tabs write
// "unlv", others "UNLV") — always look up case-insensitively.
function findAsset(idx: AssetIndex, nameOrAbbr: any): TeamAsset | null {
  if (!nameOrAbbr) return null;
  const k = norm(nameOrAbbr);
  return idx.byName.get(k) || idx.byAbbr.get(k) || null;
}

// Canonicalizes any on-screen team-name variant (e.g. team_schedule's "NMSU"
// vs game_preview's "New Mexico State") down to one key via ocr_helper, so
// cross-table matches (like the opponent's win/loss lookup below) work even
// when two tables store different naming conventions for the same team.
function buildNameCanon(rows: any[]): Map<string, string> {
  const map = new Map<string, string>();
  const variantKeys = [
    'team_name',
    'team_abbreviation',
    'name_in_schedule',
    'name_in_polls',
    'name_in_playoffs',
    'name_in_stats',
    'name_in_preview',
    'name_in_betting',
  ];
  rows.forEach((r) => {
    const canonical = norm(r.team_name);
    if (!canonical) return;
    variantKeys.forEach((vk) => {
      const variant = norm(r[vk]);
      if (variant) map.set(variant, canonical);
    });
  });
  return map;
}

function canon(map: Map<string, string>, name: any): string {
  const k = norm(name);
  return map.get(k) || k;
}

/* ============================== MAIN AGGREGATOR ============================== */

export async function getDashboardData(): Promise<DashboardData> {
  const sb = getSupabase();

  // ---- 1. Settings: one permanent row per dynasty — just identity
  // (user/dynasty/season) plus theme colors now. Team/week context lives
  // on the data tables themselves (see step 2b), not duplicated here. ----
  const { data: settingsRows, error: settingsErr } = await sb.from('settings').select('*').limit(1);
  if (settingsErr) throw new Error(`settings: ${settingsErr.message}`);
  const settingsRow = (settingsRows && settingsRows[0]) || null;
  if (!settingsRow) {
    throw new Error('No `settings` row found.');
  }
  const { user_id: userId, dynasty_id: dynastyId, current_season: season } = settingsRow;

  // Scoped query builder — every weekly table is filtered to this dynasty + season.
  const t = (table: string) => sb.from(table).select('*').eq('dynasty_id', dynastyId).eq('season', season);

  // ---- 2. Assets (static reference data, not dynasty-scoped) ----
  const { data: assetRows, error: assetErr } = await sb.from('assets').select('*');
  if (assetErr) throw new Error(`assets: ${assetErr.message}`);
  const assetIdx = buildAssetIndex(assetRows || []);

  // Team-name crosswalk (schedule/polls/playoffs/stats/preview/betting
  // naming variants → canonical team_name) — used to resolve logos even
  // when a source table stores the on-screen abbreviated form.
  const { data: ocrHelperRows, error: ocrHelperErr } = await sb.from('ocr_helper').select('*');
  if (ocrHelperErr) throw new Error(`ocr_helper: ${ocrHelperErr.message}`);
  const nameCanon = buildNameCanon(ocrHelperRows || []);

  // ---- 2b. "My team" comes from the game_preview row flagged current_week —
  // this used to be duplicated on settings.current_team, now it's a single
  // source of truth that already gets updated whenever the week advances. ----
  const { data: gpAnchorRows, error: gpAnchorErr } = await t('game_preview').eq('current_week', true).limit(1);
  if (gpAnchorErr) throw new Error(`game_preview: ${gpAnchorErr.message}`);
  const myTeamName = (gpAnchorRows && gpAnchorRows[0] && gpAnchorRows[0].team) || null;
  const myAsset = findAsset(assetIdx, myTeamName);
  const allAssets: TeamAsset[] = (assetRows || []).map(toTeamAsset);

  // ---- 3. Figure out "current week" from the game_preview row flagged
  // current_week=true (same anchor row used for myTeamName above) — that
  // flag is the single source of truth for what week the dynasty is on,
  // regular season or postseason. Only falls back to the old
  // MAX(top_25.week)/MAX(game_preview.week) heuristic if nothing is
  // flagged yet, so a fresh dynasty with no current_week set doesn't break.
  const currentWeekLabel = gpAnchorRows && gpAnchorRows[0] ? gpAnchorRows[0].week : null;
  let statsWeek: number;
  if (currentWeekLabel !== null && currentWeekLabel !== undefined) {
    statsWeek = resolveStatsWeek(currentWeekLabel);
  } else {
    const { data: pollMaxRows } = await t('top_25').order('week', { ascending: false }).limit(1);
    const { data: previewMaxRows } = pollMaxRows?.length ? { data: null } : await t('game_preview').order('week', { ascending: false }).limit(1);
    statsWeek = safeNum((pollMaxRows && pollMaxRows[0]?.week) ?? (previewMaxRows && previewMaxRows[0]?.week) ?? 0, 0);
  }
  const recapWeek = Math.max(statsWeek - 1, 0);

  // ---- 4. Fetch everything in parallel ----
  // Trimmed to the tables that actually exist in the current schema —
  // last_week_box_score, last_week_player_stats, top_25_schedule, ap_poll,
  // coaches_poll, playoff_rankings, passing/rushing/receiving,
  // my_recruit_board, national_recruit_ranks, broyles_award,
  // coach_of_the_year, and top_performers were all dropped in the schema
  // cleanup — querying any of them throws and breaks the whole dashboard,
  // which is what caused the "won't load" issue this pass fixes.
  const [
    previewRes,
    scheduleRes,
    top25Res,
    bracketRes,
    confRes,
    teamStatsRes,
    depthRes,
    hotSeatsRes,
    heismanRes,
    myCoachRes,
    myCoachHistoryRes,
    allScheduleHistoryRes,
    contentRes,
  ] = await Promise.all([
    t('game_preview').eq('week', statsWeek).limit(1),
    t('team_schedule'),
    t('top_25').eq('week', statsWeek).order('top_25', { ascending: true }),
    t('playoff_bracket').eq('week', statsWeek).limit(1),
    t('conference_standings').eq('week', statsWeek).order('conference', { ascending: true }).order('rank', { ascending: true }),
    t('team_stats').eq('week', statsWeek),
    t('depth_charts').limit(1),
    t('coaching_hotseats').eq('week', statsWeek),
    t('heisman_trophy').eq('week', statsWeek).order('rank', { ascending: true }),
    t('my_coach'),
    // Coaching history spans every season the dynasty has played, not just
    // the current one — t() would scope this to the current season only,
    // so this is a separate, deliberately season-unscoped query.
    sb.from('my_coach').select('*').eq('dynasty_id', dynastyId).order('season', { ascending: true }),
    // Same reasoning — need every season's schedule to know which past
    // seasons won the conference championship / made the playoff (and, now,
    // to compute the live career record for the Record Book below), not
    // just the current (possibly still-empty, preseason) one.
    sb.from('team_schedule').select('*').eq('dynasty_id', dynastyId),
    t('content'),
  ]);

  for (const [name, res] of Object.entries({
    previewRes, scheduleRes, top25Res, bracketRes, confRes, teamStatsRes,
    depthRes, hotSeatsRes, heismanRes, myCoachRes, myCoachHistoryRes, allScheduleHistoryRes, contentRes,
  })) {
    if ((res as any).error) throw new Error(`${name}: ${(res as any).error.message}`);
  }

  /* -------- Recap (last week's box score + leaders) --------
   * No box-score/player-stats tables exist anymore — the recap is derived
   * entirely from the most recently decided team_schedule row.
   */

  const scheduleRowsForRecap = scheduleRes.data || [];
  let lastDecidedRow: any = null;
  scheduleRowsForRecap.forEach((r: any) => {
    if (!r.w_or_l) return;
    const sw = sortWeekForScheduleRow(r);
    if (sw === null) return;
    if (!lastDecidedRow || sw > (sortWeekForScheduleRow(lastDecidedRow) as number)) lastDecidedRow = r;
  });

  const recap: Recap = {
    myBox: lastDecidedRow
      ? { TEAM: myTeamName, FINAL_SCORE: lastDecidedRow.team_score, OPPONENT: lastDecidedRow.opponent }
      : {},
    oppBox: lastDecidedRow ? { FINAL_SCORE: lastDecidedRow.opponent_score } : {},
    leaders: { team: null, passing: null, rushing: [], receiving: [] },
  };

  /* -------- Schedule (season-long, not week-scoped) -------- */

  const scheduleRows = scheduleRes.data || [];
  const games: Schedule['games'] = [];
  const postseason: Schedule['postseason'] = [];
  scheduleRows.forEach((row: any) => {
    const label = String(row.week_name || '');
    const weekMatch = label.match(/^week_(\d+)$/i);
    if (weekMatch) {
      games.push({
        week: weekMatch[1],
        sortWeek: safeNum(weekMatch[1]),
        homeAway: row.home_or_away || null,
        opponent: row.opponent || null,
        oppWins: row.opponent_wins,
        oppLosses: row.opponent_losses,
        result: normResult(row.w_or_l),
        teamScore: row.team_score,
        oppScore: row.opponent_score,
        bye: !row.home_or_away && String(row.opponent || '').toUpperCase() === 'BYE',
      });
      return;
    }
    const postseasonMeta = POSTSEASON_LABELS[label.toLowerCase()];
    if (postseasonMeta && row.opponent) {
      // Postseason rows render in the same continuous schedule table as the
      // regular season now, not a separate section — week number + suffix
      // symbol instead of a text label.
      games.push({
        week: `${postseasonMeta.sortWeek}${postseasonMeta.suffix}`,
        sortWeek: postseasonMeta.sortWeek,
        homeAway: row.home_or_away || null,
        opponent: row.opponent || null,
        oppWins: row.opponent_wins,
        oppLosses: row.opponent_losses,
        result: normResult(row.w_or_l),
        teamScore: row.team_score,
        oppScore: row.opponent_score,
        bye: false,
      });
      postseason.push({
        label: toTitleCase(label.replace(/_/g, ' ')),
        opponent: row.opponent || null,
        result: normResult(row.w_or_l),
      });
    }
  });
  games.sort((a, b) => a.sortWeek - b.sortWeek);

  // top_25_schedule (national Top 25 matchups for the week) was dropped —
  // no data source for this anymore, so it's always empty. The Schedule
  // tab's "Top 25" subtab stays parked in Coming Soon until a new source
  // is wired up.
  const top25Games: Top25Game[] = [];

  const schedule: Schedule = { games, postseason, top25: top25Games };

  /* -------- Preview (flat shape — see types.ts) -------- */

  const previewRow = previewRes.data?.[0];
  let preview: Preview | null = null;
  // True during preseason — either statsWeek hasn't reached the real season
  // yet (negative week numbers), or the current_week row is the sentinel
  // "n/a" opponent placeholder used before the schedule is even known.
  // Without this check, the code below would happily build a "next game"
  // card against a team literally named "n/a" — technically not offseason
  // (no decided result exists to match), just not a real game yet either.
  const isPreseason = statsWeek < 0 || (!!previewRow && norm(previewRow.opponent) === 'n/a');
  // True once there's no real upcoming game to preview — either the
  // current_week row is an empty future-round placeholder (team eliminated
  // before reaching it, e.g. Semifinal row with no opponent ever filled
  // in), or its opponent already has a decided result on team_schedule
  // (the flag is still sitting on the just-played elimination game itself).
  // Either way this means offseason/no-next-game, not a broken preview.
  const isOffseason =
    !isPreseason &&
    (!previewRow ||
      !previewRow.opponent ||
      scheduleRows.some((r: any) => canon(nameCanon, r.opponent) === canon(nameCanon, previewRow.opponent) && !!r.w_or_l));
  if (previewRow && !isOffseason && !isPreseason) {
    // Opponent's win/loss record isn't on game_preview — pull it from the
    // matching, not-yet-played row in team_schedule instead. Matched via
    // nameCanon since the two tables store different on-screen naming
    // conventions for the same team (e.g. "NMSU" vs "New Mexico State").
    const oppScheduleRow = scheduleRows.find(
      (r: any) => canon(nameCanon, r.opponent) === canon(nameCanon, previewRow.opponent) && !r.w_or_l
    );
    preview = {
      myTeam: previewRow.team,
      oppTeam: previewRow.opponent,
      day: previewRow.game_day,
      date: previewRow.game_date,
      time: '',
      broadcast: previewRow.game_broadcast,
      location: previewRow.game_location,
      teamOverall: previewRow.team_overall,
      teamOffense: previewRow.team_offense,
      teamDefense: previewRow.team_defense,
      oppOverall: previewRow.opponent_overall,
      oppOffense: previewRow.opponent_offense,
      oppDefense: previewRow.opponent_defense,
      winProbabilityMine: previewRow.team_win_probability,
      winProbabilityOpp: previewRow.opponent_win_probability,
      favorite: previewRow.favorite,
      favoriteSpread: previewRow.favorite_spread,
      favoriteMoneyline: previewRow.favorite_moneyline,
      overUnder: previewRow.total_over_under,
      oppWins: oppScheduleRow?.opponent_wins,
      oppLosses: oppScheduleRow?.opponent_losses,
    };
  }

  /* -------- Rankings -------- */
  // Single consolidated Top 25 now (coaches_poll was dropped) — still keyed
  // as `rank.ap` internally to avoid touching every call site, but it's
  // sourced from `top_25` and there's no `coaches` list fed anymore.

  const toPoll = (rows: any[], rankCol: string): PollEntry[] =>
    rows.map((r) => ({
      rank: safeNum(r[rankCol]),
      team: r.team,
      wins: safeNum(r.wins),
      losses: safeNum(r.losses),
    }));
  const rank = { ap: toPoll(top25Res.data || [], 'top_25'), coaches: [] as PollEntry[] };

  /* -------- Playoff --------
   * playoff_rankings (CFP seed list) was dropped — no data source anymore,
   * so seeds is always empty. rankFor()/rankedName() fall straight through
   * to the Top 25 poll, which is the only ranking source left.
   */

  const playoff: Playoff = { seeds: [] };
  const playoffBracketUrl: string | null = bracketRes.data?.[0]?.cfb_playoff_bracket_url || null;

  /* -------- Conference standings -------- */

  const conf: ConfRow[] = (confRes.data || []).map((r: any) => ({
    conference: r.conference,
    rank: r.rank,
    team: r.team,
    confW: r.conference_wins,
    confL: r.conference_losses,
    overallW: r.overall_wins,
    overallL: r.overall_losses,
  }));

  /* -------- Team stats (now split offense/defense via
     team_stats.offense_or_defense_stat) -------- */

  const teamStatsRows = teamStatsRes.data || [];
  function statsSplit(kind: 'offense' | 'defense'): TeamStatsSplit {
    const rows = teamStatsRows.filter((r: any) => norm(r.offense_or_defense_stat) === kind);
    return {
      national: rows
        .filter((r: any) => /^\d+$/.test(String(r.national_rank)))
        .sort((a: any, b: any) => safeNum(a.national_rank) - safeNum(b.national_rank))
        .map((r: any) => ({
          rank: safeNum(r.national_rank),
          team: r.team,
          ppg: r.points_per_game,
          ypg: r.yards_per_game,
          passYpg: r.pass_yards_per_game,
          rushYpg: r.rush_yards_per_game,
        })),
      mine: (() => {
        const r = rows.find((r: any) => norm(r.national_rank) === 'user_team');
        return r ? { team: r.team, ppg: r.points_per_game, ypg: r.yards_per_game, passYpg: r.pass_yards_per_game, rushYpg: r.rush_yards_per_game } : null;
      })(),
    };
  }
  const teamStats: TeamStats = { offense: statsSplit('offense'), defense: statsSplit('defense') };

  /* -------- Recruiting --------
   * my_recruit_board / national_recruit_ranks were dropped — no data
   * source, and the Recruiting subtab stays parked in Coming Soon anyway.
   */

  const recruit: Recruit = { board: [], classRankings: [], myClass: null };

  /* -------- Roster (depth charts only) -------- */

  const depthRow = depthRes.data?.[0];
  const roster: Roster = {
    depthChartLinkOffense: depthRow?.offense_depth_chart_url || null,
    depthChartLinkDefense: depthRow?.defense_depth_chart_url || null,
  };

  /* -------- Coach (hot seats only — "moves" has no data source) -------- */

  const coach: Coach = {
    hotSeats: (hotSeatsRes.data || []).map((r: any) => ({ team: r.team, coach: r.coach, security: r.job_security })),
    moves: [],
  };

  /* -------- Awards (Heisman only — Broyles/COY tables were dropped) -------- */

  const toAwardRow = (r: any): { rank: number; name: any; team: any; pos: any } => ({
    rank: safeNum(r.rank),
    name: r.name,
    team: r.team,
    pos: r.position,
  });
  const awards: Awards = {
    heisman: (heismanRes.data || []).filter((r: any) => r.name).map(toAwardRow),
    coordinator: [],
    coach: [],
  };

  /* -------- My Coach -------- */

  const myCoachRow = myCoachRes.data?.[0];
  const myCoachHistoryRows = myCoachHistoryRes.data || [];
  const allScheduleHistoryRows = allScheduleHistoryRes.data || [];

  // Record Book "Overall" used to read straight off my_coach.career_wins /
  // career_losses — static fields Chris has to remember to update every
  // week, which is why they kept lagging behind the real season. Now it's
  // computed live from every decided game across every season's
  // team_schedule, so it can never fall out of sync again.
  let liveOverallW = 0;
  let liveOverallL = 0;
  allScheduleHistoryRows.forEach((r: any) => {
    const res = normResult(r.w_or_l);
    if (res === 'W') liveOverallW++;
    else if (res === 'L') liveOverallL++;
  });

  const myCoach: MyCoach = {
    name: myCoachRow?.name,
    overallW: liveOverallW,
    overallL: liveOverallL,
    bowlWins: myCoachRow?.bowl_wins,
    confTitles: myCoachRow?.conference_championships,
    playoffApps: myCoachRow?.playoff_apperances,
    natTitles: myCoachRow?.national_titles,
    awards: myCoachRow?.awards,
    almaMater: myCoachRow?.alma_mater,
    pipeline: myCoachRow?.recruiting_pipeline,
    offensePlaybook: myCoachRow?.offense,
    defensePlaybook: myCoachRow?.defense,
    coachingPhilosophy: myCoachRow?.coaching_philosophy,
    background: myCoachRow?.coaching_background,
    photoLink: myCoachRow?.image_url,
    // One row per season now exists in my_coach (season/team/title/
    // season_wins/season_losses each carried on that season's own row), so
    // history spans every season fetched via the season-unscoped query
    // above — not just whatever the current season's single row says.
    history: myCoachHistoryRows
      .filter((r: any) => r.team)
      .map((r: any) => {
        const seasonScheduleRows = allScheduleHistoryRows.filter((sr: any) => sr.season === r.season);
        const wonConfChamp = seasonScheduleRows.some((sr: any) => norm(sr.week_name) === 'conference_championship' && normResult(sr.w_or_l) === 'W');
        const madePlayoffs = seasonScheduleRows.some((sr: any) =>
          ['bowl_game', 'playoff_round_1', 'playoff_quarterfinals', 'playoff_semifinals', 'national_championship'].includes(norm(sr.week_name))
        );
        return { season: r.season, team: r.team, position: r.title, wins: r.season_wins, losses: r.season_losses, wonConfChamp, madePlayoffs };
      }),
  };

  /* -------- Content -------- */

  // content_input_type is free text Chris types by hand, not a fixed enum
  // (e.g. "Dynasty Drive-By", "T.B.'s Top 3 Take") — matched by keyword
  // rather than an exact string so small wording variance doesn't silently
  // drop rows the way the original exact-match map did.
  const classifyContentType = (raw: any): keyof Content | null => {
    const s = norm(raw);
    if (!s) return null;
    if (s.includes('drive')) return 'driveBy';
    if (s.includes('top') && (s.includes('take') || s.includes('takes'))) return 'topTakes';
    if (s.includes('podcast')) return 'podcast';
    if (s.includes('social')) return 'social';
    if (s.includes('news') || s.includes('team_news')) return 'newspaper';
    if (s.includes('headline')) return 'headlines';
    if (s.includes('army')) return 'huffArmy';
    return null;
  };
  const content: Content = { podcast: [], social: [], newspaper: [], headlines: [], huffArmy: [], driveBy: [], topTakes: [] };
  (contentRes.data || []).forEach((r: any) => {
    const key = classifyContentType(r.content_input_type);
    if (!key || !r.headline) return;
    content[key].push({ link: null, headline: r.headline, subHeadline: r.sub_headline, homePage: null, contentTab: null, graphicUrl: r.content_graphic_url || null, team: r.team || null });
  });

  /* -------- Record + opponent asset -------- */

  // Record is driven directly by every team_schedule row with a decided
  // result — not just the regular-season `games` array — so conference
  // championship / bowl / playoff wins and losses count toward it too.
  let wins = 0,
    losses = 0;
  scheduleRows.forEach((row: any) => {
    if (normResult(row.w_or_l) === 'W') wins++;
    else if (normResult(row.w_or_l) === 'L') losses++;
  });
  const myApRank = rank.ap.find((r) => norm(r.team) === norm(myTeamName));
  const oppAsset = preview?.oppTeam ? findAsset(assetIdx, preview.oppTeam) : null;

  const result: DashboardData = {
    settings: {
      currentDataSheet: displayWeekLabel(statsWeek, scheduleRes.data || []),
      currentTeam: myTeamName,
      currentWeek: statsWeek,
      primaryColor: settingsRow.primary_color || null,
      secondaryColor: settingsRow.secondary_color || null,
      tbIconUrl: settingsRow.tb_icon_url || null,
      tacoBellLogoUrl: settingsRow.taco_bell_logo_url || null,
      dhqBetsLogoUrl: settingsRow.dhqbets_logo_url || null,
      conferenceLogoUrl: settingsRow.conference_logo_url || null,
      podcastThumbnailUrl: settingsRow.podcast_thumbnail_url || null,
    },
    team: myAsset,
    opponent: oppAsset,
    assets: allAssets,
    ocrHelper: ocrHelperRows || [],
    record: { wins, losses, apRank: myApRank ? myApRank.rank : null, coachesRank: null, cfpRank: null },
    recap,
    preview,
    isOffseason,
    isPreseason,
    preseasonPreview: { overall: null, offense: null, defense: null, aaOffense: null, aaDefense: null, acOffense: null, acDefense: null },
    schedule,
    rank,
    playoff,
    playoffBracketUrl,
    conf,
    teamStats,
    recruit,
    roster,
    coach,
    awards,
    myCoach,
    content,
    storyBrief: [],
  };
  result.storyBrief = buildStoryBrief(result, myTeamName);
  return result;
}

/* ============================== STORY BRIEF ==============================
 * Unchanged from the original — it reads from the already-shaped
 * DashboardData object, so it doesn't care that the data now comes from
 * Supabase instead of Sheets.
 */

function buildStoryBrief(d: Partial<DashboardData>, myTeamName: any): StoryBriefItem[] {
  const items: StoryBriefItem[] = [];
  const upper = (s: any) => String(s || '').toUpperCase();

  const list = (d.rank && d.rank.ap) || [];
  const mine = list.find((r) => upper(r.team) === upper(myTeamName));
  if (mine) {
    if (mine.enteredPoll) {
      items.push({ tag: 'Notable', text: `${myTeamName} entered the Top 25 at #${mine.rank}.` });
    } else if ((mine.changeNum ?? 0) >= 5) {
      items.push({
        tag: 'Notable',
        text: `${myTeamName} ${mine.changeDir === 'UP' ? 'jumped' : 'dropped'} ${mine.changeNum} spots in the Top 25 to #${mine.rank}.`,
      });
    } else if (mine.rank <= 10 && mine.changeNum) {
      items.push({
        tag: 'Top 10',
        text: `${myTeamName} moved ${mine.changeDir === 'UP' ? 'up' : 'down'} ${mine.changeNum} within the Top 10, now #${mine.rank}.`,
      });
    }
  }

  const my = d.recap && d.recap.myBox;
  if (my && my.FINAL_SCORE !== undefined) {
    const oppBox = d.recap && d.recap.oppBox;
    const oppKey = oppBox && Object.keys(oppBox).length ? oppBox : null;
    if (oppKey && oppKey.FINAL_SCORE !== undefined) {
      const margin = Math.abs(safeNum(my.FINAL_SCORE) - safeNum(oppKey.FINAL_SCORE));
      if (margin <= 8) {
        const oppName = my['OPPONENT'] || '';
        items.push({
          tag: 'Close Game',
          text: `${myTeamName} ${safeNum(my.FINAL_SCORE) > safeNum(oppKey.FINAL_SCORE) ? 'beat' : 'lost to'} ${oppName} ${my.FINAL_SCORE}-${oppKey.FINAL_SCORE}.`,
        });
      }
    }
  }

  const heisman = (d.awards && d.awards.heisman) || [];
  const myHeisman = heisman.find((h) => upper(h.team) === upper(myTeamName) && h.rank <= 5);
  if (myHeisman) items.push({ tag: 'Heisman', text: `${myHeisman.name} (${myTeamName}) is #${myHeisman.rank} in the Heisman race.` });

  const hotSeats = (d.coach && d.coach.hotSeats) || [];
  const myHotSeat = hotSeats.find((h) => upper(h.team) === upper(myTeamName));
  if (myHotSeat && Number(myHotSeat.security) < 35) {
    items.push({ tag: 'Hot Seat', text: `${myHotSeat.coach} is on the hot seat at ${myTeamName} — ${myHotSeat.security}% job security.` });
  }

  return items;
}

export async function getMyTeamName(): Promise<any> {
  const sb = getSupabase();
  const { data, error } = await sb.from('game_preview').select('team').eq('current_week', true).limit(1);
  if (error) throw new Error(error.message);
  return data?.[0]?.team;
}
