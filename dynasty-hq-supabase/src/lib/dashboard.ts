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
  PlayerStats,
  PlayerStatBlock,
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

function norm(s: any): string {
  return String(s || '').trim().toLowerCase();
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
  // MAX(ap_poll.week)/MAX(game_preview.week) heuristic if nothing is
  // flagged yet, so a fresh dynasty with no current_week set doesn't break.
  const currentWeekLabel = gpAnchorRows && gpAnchorRows[0] ? gpAnchorRows[0].week : null;
  let statsWeek: number;
  if (currentWeekLabel !== null && currentWeekLabel !== undefined) {
    statsWeek = resolveStatsWeek(currentWeekLabel);
  } else {
    const { data: apMaxRows } = await t('ap_poll').order('week', { ascending: false }).limit(1);
    const { data: previewMaxRows } = apMaxRows?.length ? { data: null } : await t('game_preview').order('week', { ascending: false }).limit(1);
    statsWeek = safeNum((apMaxRows && apMaxRows[0]?.week) ?? (previewMaxRows && previewMaxRows[0]?.week) ?? 0, 0);
  }
  const recapWeek = Math.max(statsWeek - 1, 0);

  // ---- 4. Fetch everything in parallel ----
  const [
    boxScoreRes,
    playerStatsRecapRes,
    previewRes,
    scheduleRes,
    top25Res,
    apRes,
    coachesRes,
    playoffRes,
    bracketRes,
    confRes,
    teamStatsRes,
    passingRes,
    rushingRes,
    receivingRes,
    recruitBoardRes,
    recruitRanksRes,
    depthRes,
    hotSeatsRes,
    heismanRes,
    broylesRes,
    coyRes,
    myCoachRes,
    contentRes,
    topPerformersRes,
  ] = await Promise.all([
    t('last_week_box_score').eq('week', recapWeek).limit(1),
    t('last_week_player_stats').eq('week', recapWeek).limit(1),
    t('game_preview').eq('week', statsWeek).limit(1),
    t('team_schedule'),
    t('top_25_schedule').eq('week', statsWeek),
    t('ap_poll').eq('week', statsWeek).order('ap_poll', { ascending: true }),
    t('coaches_poll').eq('week', statsWeek).order('coaches_poll', { ascending: true }),
    t('playoff_rankings').eq('week', statsWeek).order('playoff_ranking', { ascending: true }),
    t('playoff_bracket').eq('week', statsWeek).limit(1),
    t('conference_standings').eq('week', statsWeek).order('conference', { ascending: true }).order('rank', { ascending: true }),
    t('team_stats').eq('week', statsWeek),
    t('passing').eq('week', statsWeek),
    t('rushing').eq('week', statsWeek),
    t('receiving').eq('week', statsWeek),
    t('my_recruit_board').order('stars', { ascending: false }),
    t('national_recruit_ranks'),
    t('depth_charts').limit(1),
    t('coaching_hotseats').eq('week', statsWeek),
    t('heisman_trophy').eq('week', statsWeek).order('rank', { ascending: true }),
    t('broyles_award').eq('week', statsWeek).order('rank', { ascending: true }),
    t('coach_of_the_year').eq('week', statsWeek).order('rank', { ascending: true }),
    t('my_coach'),
    t('content'),
    t('top_performers').eq('week', statsWeek),
  ]);

  for (const [name, res] of Object.entries({
    boxScoreRes, playerStatsRecapRes, previewRes, scheduleRes, top25Res, apRes, coachesRes,
    playoffRes, bracketRes, confRes, teamStatsRes, passingRes, rushingRes, receivingRes,
    recruitBoardRes, recruitRanksRes, depthRes, hotSeatsRes, heismanRes, broylesRes, coyRes,
    myCoachRes, contentRes, topPerformersRes,
  })) {
    if ((res as any).error) throw new Error(`${name}: ${(res as any).error.message}`);
  }

  /* -------- Recap (last week's box score + leaders) -------- */

  const boxRow = boxScoreRes.data?.[0];
  const playerRow = playerStatsRecapRes.data?.[0];

  // Fallback: derive last week's final score from team_schedule instead of
  // requiring a separate last_week_box_score entry — the schedule row
  // already gets filled in as part of the normal weekly OCR pass, so this
  // covers the score/opponent/W-L even before (or without) a full box score.
  const scheduleFallbackRow = !boxRow?.final_score
    ? (scheduleRes.data || []).find((r: any) => String(r.week_name || '').toLowerCase() === `week_${recapWeek}`)
    : null;

  const recap: Recap = {
    myBox: boxRow?.final_score
      ? {
          TEAM: boxRow.team,
          Q1_SCORE: boxRow.q1_score,
          Q2_SCORE: boxRow.q2_score,
          Q3_SCORE: boxRow.q3_score,
          Q4_SCORE: boxRow.q4_score,
          FINAL_SCORE: boxRow.final_score,
          PASS_YARDS: boxRow.pass_yards,
          RUSH_YARDS: boxRow.rush_yards,
          TOTAL_YARDS: boxRow.total_yards,
          TURNOVERS: boxRow.turnovers,
          OPPONENT: boxRow.opponent,
        }
      : scheduleFallbackRow
      ? {
          TEAM: myTeamName,
          FINAL_SCORE: scheduleFallbackRow.team_score,
          OPPONENT: scheduleFallbackRow.opponent,
        }
      : {},
    oppBox: boxRow?.final_score
      ? {
          Q1_SCORE: boxRow.opponent_q1_score,
          Q2_SCORE: boxRow.opponent_q2_score,
          Q3_SCORE: boxRow.opponent_q3_score,
          Q4_SCORE: boxRow.opponent_q4_score,
          FINAL_SCORE: boxRow.opponent_final_score,
          PASS_YARDS: boxRow.opponent_pass_yards,
          RUSH_YARDS: boxRow.opponent_rush_yards,
          TOTAL_YARDS: boxRow.opponent_total_yards,
          TURNOVERS: boxRow.opponent_turnovers,
        }
      : scheduleFallbackRow
      ? { FINAL_SCORE: scheduleFallbackRow.opponent_score }
      : {},
    leaders: {
      team: playerRow?.team,
      passing: playerRow?.passing_name
        ? { name: playerRow.passing_name, yards: playerRow.passing_yards, td: playerRow.passing_tds }
        : null,
      rushing: playerRow?.rushing_name
        ? [{ name: playerRow.rushing_name, yards: playerRow.rushing_yards, td: playerRow.rushing_tds }]
        : [],
      receiving: playerRow?.receiving_name
        ? [{ name: playerRow.receiving_name, yards: playerRow.receiving_yards, td: playerRow.receiving_tds }]
        : [],
    },
  };

  /* -------- Schedule (season-long, not week-scoped) -------- */

  const POSTSEASON_LABELS = [
    'conference_championship',
    'bowl_game',
    'playoff_round_1',
    'playoff_quarterfinals',
    'playoff_semifinals',
    'national_championship',
  ];

  const scheduleRows = scheduleRes.data || [];
  const games: Schedule['games'] = [];
  const postseason: Schedule['postseason'] = [];
  scheduleRows.forEach((row: any) => {
    const label = String(row.week_name || '');
    const weekMatch = label.match(/^week_(\d+)$/i);
    if (weekMatch) {
      games.push({
        week: weekMatch[1],
        homeAway: row.home_or_away || null,
        opponent: row.opponent || null,
        oppWins: row.opponent_wins,
        oppLosses: row.opponent_losses,
        result: row.w_or_l || null,
        teamScore: row.team_score,
        oppScore: row.opponent_score,
        bye: !row.home_or_away && String(row.opponent || '').toUpperCase() === 'BYE',
      });
      return;
    }
    if (POSTSEASON_LABELS.includes(label.toLowerCase()) && row.opponent) {
      postseason.push({
        label: toTitleCase(label.replace(/_/g, ' ')),
        opponent: row.opponent || null,
        result: row.w_or_l || null,
      });
    }
  });
  games.sort((a, b) => safeNum(a.week) - safeNum(b.week));

  const top25: Top25Game[] = (top25Res.data || []).map((row: any) => ({
    away: row.away_team,
    awayRank: row.away_rank,
    home: row.home_team,
    homeRank: row.home_rank,
    time: row.time_of_game || '',
    broadcast: row.broadcast,
    spreadFavorite: row.spread_favorite,
    spreadNumber: row.spread_value,
  }));

  const schedule: Schedule = { games, postseason, top25 };

  /* -------- Preview (flat shape — see types.ts) -------- */

  const previewRow = previewRes.data?.[0];
  let preview: Preview | null = null;
  if (previewRow) {
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

  const toPoll = (rows: any[], rankCol: string): PollEntry[] =>
    rows.map((r) => ({
      rank: safeNum(r[rankCol]),
      team: r.team,
      wins: safeNum(r.wins),
      losses: safeNum(r.losses),
      lastWeek: r.last_week !== null && r.last_week !== undefined && r.last_week !== '' ? safeNum(r.last_week) : null,
    }));
  const rank = { ap: toPoll(apRes.data || [], 'ap_poll'), coaches: toPoll(coachesRes.data || [], 'coaches_poll') };

  /* -------- Playoff -------- */

  const playoff: Playoff = {
    seeds: (playoffRes.data || [])
      .filter((r: any) => r.team)
      .map((r: any) => ({ rank: safeNum(r.playoff_ranking), team: r.team, wins: r.wins, losses: r.losses })),
  };
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
    pf: r.points_for,
    pa: r.points_against,
  }));

  /* -------- Team stats -------- */

  const teamStatsRows = teamStatsRes.data || [];
  const teamStats: TeamStats = {
    national: teamStatsRows
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
      const r = teamStatsRows.find((r: any) => norm(r.national_rank) === 'user_team');
      return r ? { team: r.team, ppg: r.points_per_game, ypg: r.yards_per_game, passYpg: r.pass_yards_per_game, rushYpg: r.rush_yards_per_game } : null;
    })(),
    // No per-category rank row in the new schema (old sheet's
    // USER_TEAM_RANK_FOR_CATEGORY row has no equivalent table/column).
    mineRank: null,
  };

  /* -------- Player stats -------- */

  // Photos set manually per category (passing/rushing/receiving) in top_performers —
  // matched by category, not by name, since the leader can change week to week.
  const topPerformerPhoto: Record<string, string | null> = {};
  (topPerformersRes.data || []).forEach((r: any) => {
    const cat = norm(r.category);
    if (cat) topPerformerPhoto[cat] = r.photo_url || null;
  });

  function playerBlock(rows: any[], category: string): PlayerStatBlock {
    return {
      national: rows
        .filter((r) => /^\d+$/.test(String(r.rank)))
        .sort((a, b) => safeNum(a.rank) - safeNum(b.rank))
        .map((r) => ({ rank: safeNum(r.rank), name: r.name, team: r.team, td: r.tds, yards: r.yards })),
      leaders: rows
        .filter((r) => norm(r.rank).startsWith('user_team'))
        .map((r) => ({ name: r.name, team: r.team, td: r.tds, yards: r.yards, photoUrl: topPerformerPhoto[category] || null })),
    };
  }
  const playerStats: PlayerStats = {
    passing: playerBlock(passingRes.data || [], 'passing'),
    rushing: playerBlock(rushingRes.data || [], 'rushing'),
    receiving: playerBlock(receivingRes.data || [], 'receiving'),
  };

  /* -------- Recruiting -------- */

  const recruitRankRows = recruitRanksRes.data || [];
  const recruit: Recruit = {
    board: (recruitBoardRes.data || []).map((r: any) => ({ name: r.name, position: r.position, stars: safeNum(r.stars), status: r.status })),
    classRankings: recruitRankRows
      .filter((r: any) => /^\d+$/.test(String(r.class_rankings)))
      .sort((a: any, b: any) => safeNum(a.class_rankings) - safeNum(b.class_rankings))
      .map((r: any) => ({ rank: safeNum(r.class_rankings), team: r.team, avgStars: r.average_star, commits: r.number_of_commits })),
    myClass: (() => {
      const r = recruitRankRows.find((r: any) => norm(r.class_rankings) === 'user_team');
      return r ? { team: r.team, avgStars: r.average_star, commits: r.number_of_commits } : null;
    })(),
  };

  /* -------- Roster (depth charts only — see note below) -------- */

  // Old schema also had PLAYERS_LEAVING and DRAFT_RESULTS sub-sections;
  // the new depth_charts table only carries depth chart links. Add
  // corresponding columns/tables later if those need to come back.
  const depthRow = depthRes.data?.[0];
  const roster: Roster = {
    depthChartLinkOffense: depthRow?.offense_depth_chart_url || null,
    depthChartLinkDefense: depthRow?.defense_depth_chart_url || null,
  };

  /* -------- Coach (hot seats only — "moves" has no data source anymore) -------- */

  const coach: Coach = {
    hotSeats: (hotSeatsRes.data || []).map((r: any) => ({ team: r.team, coach: r.coach, security: r.job_security })),
    moves: [],
  };

  /* -------- Awards -------- */

  const toAwardRow = (r: any): { rank: number; name: any; team: any; pos: any } => ({
    rank: safeNum(r.rank),
    name: r.name,
    team: r.team,
    pos: r.position,
  });
  const awards: Awards = {
    heisman: (heismanRes.data || []).filter((r: any) => r.name).map(toAwardRow),
    // broyles_award = real-life name for the top-assistant-coach award, maps to the old "coordinator" block.
    coordinator: (broylesRes.data || []).filter((r: any) => r.name).map(toAwardRow),
    // coach_of_the_year has no position column — pos will just render blank, which is correct for a HC award.
    coach: (coyRes.data || []).filter((r: any) => r.name).map((r: any) => ({ rank: safeNum(r.rank), name: r.name, team: r.team, pos: null })),
  };

  /* -------- My Coach -------- */

  const myCoachRow = myCoachRes.data?.[0];
  const myCoach: MyCoach = {
    name: myCoachRow?.name,
    overallW: myCoachRow?.career_wins,
    overallL: myCoachRow?.career_losses,
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
    background: myCoachRow?.background,
    photoLink: myCoachRow?.image_url,
    // Current schema carries exactly one season-history row inline on the
    // same record (season/team/title/season_wins/season_losses). If you
    // start tracking multi-season history, this becomes a real query
    // against a season-by-season table instead of a single row.
    history: myCoachRow?.team
      ? [{ season: myCoachRow.season, team: myCoachRow.team, position: myCoachRow.title, wins: myCoachRow.season_wins, losses: myCoachRow.season_losses }]
      : [],
  };

  /* -------- Content -------- */

  const CONTENT_TYPE_MAP: Record<string, keyof Content> = {
    podcast: 'podcast',
    social_media: 'social',
    team_news: 'newspaper',
    national_headline_1: 'headlines',
    national_headline_2: 'headlines',
    national_headline_3: 'headlines',
  };
  const content: Content = { podcast: [], social: [], newspaper: [], headlines: [] };
  (contentRes.data || []).forEach((r: any) => {
    const key = CONTENT_TYPE_MAP[norm(r.content_input_type)];
    if (!key || !r.headline) return;
    content[key].push({ link: null, headline: r.headline, subHeadline: r.sub_headline, homePage: null, contentTab: null, graphicUrl: r.content_graphic_url || null });
  });

  /* -------- Record + opponent asset -------- */

  let wins = 0,
    losses = 0;
  games.forEach((g) => {
    if (g.result === 'W') wins++;
    else if (g.result === 'L') losses++;
  });
  const myApRank = rank.ap.find((r) => norm(r.team) === norm(myTeamName));
  const myCoachesRank = rank.coaches.find((r) => norm(r.team) === norm(myTeamName));
  const oppAsset = preview?.oppTeam ? findAsset(assetIdx, preview.oppTeam) : null;

  const result: DashboardData = {
    settings: {
      currentDataSheet: `Week ${statsWeek}`,
      currentTeam: myTeamName,
      currentWeek: statsWeek,
      primaryColor: settingsRow.primary_color || null,
      secondaryColor: settingsRow.secondary_color || null,
    },
    team: myAsset,
    opponent: oppAsset,
    assets: allAssets,
    ocrHelper: ocrHelperRows || [],
    record: { wins, losses, apRank: myApRank ? myApRank.rank : null, coachesRank: myCoachesRank ? myCoachesRank.rank : null },
    recap,
    preview,
    preseasonPreview: { overall: null, offense: null, defense: null, aaOffense: null, aaDefense: null, acOffense: null, acDefense: null },
    schedule,
    rank,
    playoff,
    playoffBracketUrl,
    conf,
    teamStats,
    playerStats,
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

  (['ap', 'coaches'] as const).forEach((pollKey) => {
    const list = (d.rank && d.rank[pollKey]) || [];
    const mine = list.find((r) => upper(r.team) === upper(myTeamName));
    const pollLabel = pollKey === 'ap' ? 'AP Poll' : 'Coaches Poll';
    if (mine) {
      if (mine.enteredPoll) {
        items.push({ tag: 'Notable', text: `${myTeamName} entered the ${pollLabel} at #${mine.rank}.` });
      } else if ((mine.changeNum ?? 0) >= 5) {
        items.push({
          tag: 'Notable',
          text: `${myTeamName} ${mine.changeDir === 'UP' ? 'jumped' : 'dropped'} ${mine.changeNum} spots in the ${pollLabel} to #${mine.rank}.`,
        });
      } else if (mine.rank <= 10 && mine.changeNum) {
        items.push({
          tag: 'Top 10',
          text: `${myTeamName} moved ${mine.changeDir === 'UP' ? 'up' : 'down'} ${mine.changeNum} within the Top 10 (${pollLabel}), now #${mine.rank}.`,
        });
      }
    }
  });

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
