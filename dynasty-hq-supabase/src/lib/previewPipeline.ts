/**
 * ============================ PREVIEW PIPELINE ============================
 * Everything that turns a processed team schedule into a COMPLETE game
 * preview: the preview rows themselves, the odds/win-probability/ratings
 * columns, and the broadcast network.
 *
 * `completeWeekPreviews()` is the one entry point. It is safe to call any
 * number of times (every step is idempotent) and it is called from BOTH:
 *   - ocr-process, after a batch that touched a schedule / best-matchups, and
 *   - ocr-advance-week, right before a week goes live,
 * so a preview can no longer be left half-filled just because uploads arrived
 * in a different order (e.g. a member uploading after the commissioner).
 *
 * Nothing here throws on a data problem — each step returns what it did and
 * what it skipped, so callers can surface it instead of failing silently.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { computeMatchupOdds } from '@/lib/engines/odds';
import { assignBroadcasts, type SlateGame, type SlateTeam } from '@/lib/engines/broadcast';
import { syncGamePreviewFromSchedule } from '@/lib/gamePreview';

export interface TeamRating {
  overall: number;
  offense: number;
  defense: number;
  homeState: string | null;
}
export type RatingsByName = Record<string, TeamRating>;
export type ConferenceByName = Record<string, string | null>;

/**
 * The schedule screen shows generic placeholder opponents ("FCS Southeast",
 * "FCS West") that have no row in ocr_helper. Without a rating, their game
 * could never get odds. They are given one flat rating instead — change these
 * numbers here if FCS opponents should be treated as stronger or weaker.
 */
export const GENERIC_FCS_RATING: TeamRating = { overall: 60, offense: 60, defense: 60, homeState: null };

export function lookupRating(ratings: RatingsByName, name: string | null | undefined): TeamRating | null {
  if (!name) return null;
  if (ratings[name]) return ratings[name];
  if (/^FCS\b/i.test(name.trim())) return GENERIC_FCS_RATING;
  return null;
}

/** Ratings (keyed by every name variant) + conferences, same shape the OCR route builds. */
export async function loadRatingTables(sb: SupabaseClient): Promise<{ ratingsByName: RatingsByName; conferenceByName: ConferenceByName; error?: string }> {
  const ratingsByName: RatingsByName = {};
  const conferenceByName: ConferenceByName = {};
  const { data: helperRows, error: helperErr } = await sb
    .from('ocr_helper')
    .select('team_name, name_in_schedule, name_in_polls, name_in_playoffs, name_in_stats, name_in_preview, name_in_betting, overall_rating, offense_rating, defense_rating, home_state');
  if (helperErr) return { ratingsByName, conferenceByName, error: `ocr_helper: ${helperErr.message}` };
  (helperRows || []).forEach((r: any) => {
    const rating = { overall: Number(r.overall_rating), offense: Number(r.offense_rating), defense: Number(r.defense_rating), homeState: r.home_state || null };
    [r.team_name, r.name_in_schedule, r.name_in_polls, r.name_in_playoffs, r.name_in_stats, r.name_in_preview, r.name_in_betting]
      .filter(Boolean)
      .forEach((name: string) => {
        ratingsByName[name] = rating;
      });
  });
  const { data: assetRows, error: assetErr } = await sb.from('assets').select('team_name, team_conference');
  if (assetErr) return { ratingsByName, conferenceByName, error: `assets: ${assetErr.message}` };
  (assetRows || []).forEach((r: any) => {
    conferenceByName[r.team_name] = r.team_conference || null;
  });
  return { ratingsByName, conferenceByName };
}

export interface PreviewScope {
  dynastyId: string;
  season: number;
  week: number;
}

/**
 * Ratings, odds and win probability for every game_preview row in the week
 * (or just one team's, with `onlyTeam`). Records come from each team's
 * processed schedule: this team's W-L from its own decided games before this
 * week, the opponent's from the OPP W-L column.
 */
export async function runGamePreviewOdds({
  sb,
  scope,
  ratingsByName,
  onlyTeam,
}: {
  sb: SupabaseClient;
  scope: PreviewScope;
  ratingsByName: RatingsByName;
  onlyTeam: string | null;
}): Promise<{ written: number; issues: string[]; error?: string }> {
  let q = sb.from('game_preview').select('id, team, opponent, home_team').eq('dynasty_id', scope.dynastyId).eq('season', scope.season).eq('week', scope.week);
  if (onlyTeam) q = q.eq('team', onlyTeam);
  const { data: rows, error } = await q;
  if (error) return { written: 0, issues: [], error: `game_preview fetch failed: ${error.message}` };

  const { data: schedRows } = await sb
    .from('team_schedule')
    .select('team, week, w_or_l, opponent_wins, opponent_losses')
    .eq('dynasty_id', scope.dynastyId)
    .eq('season', scope.season);
  const recordOf = (team: string) => {
    let w = 0, l = 0;
    (schedRows || []).forEach((r: any) => {
      if (r.team !== team || r.week >= scope.week) return;
      if (r.w_or_l === 'W') w++;
      else if (r.w_or_l === 'L') l++;
    });
    return { w, l };
  };
  const oppRecordFor = (team: string) => {
    const r = (schedRows || []).find((x: any) => x.team === team && x.week === scope.week);
    return { w: Number(r?.opponent_wins ?? 0) || 0, l: Number(r?.opponent_losses ?? 0) || 0 };
  };

  const issues: string[] = [];
  let written = 0;
  for (const preview of rows || []) {
    if (!preview.team || !preview.opponent || !preview.home_team) {
      issues.push(`game_preview row ${preview.id} has no team/opponent/home team yet`);
      continue;
    }
    const homeName = preview.home_team;
    const awayName = homeName === preview.team ? preview.opponent : preview.team;
    const homeRatings = lookupRating(ratingsByName, homeName);
    const awayRatings = lookupRating(ratingsByName, awayName);
    if (!homeRatings || !awayRatings) {
      issues.push(`${preview.team} week ${scope.week}: no rating for "${!homeRatings ? homeName : awayName}" (add it to ocr_helper), so this preview has no odds yet`);
      continue;
    }
    const mine = recordOf(preview.team);
    const theirs = oppRecordFor(preview.team);
    const teamIsHome = preview.team === homeName;
    const odds = computeMatchupOdds({
      homeTeam: { name: homeName, ...homeRatings },
      awayTeam: { name: awayName, ...awayRatings },
      connector: 'AT',
      gameLocation: null,
      homeWins: teamIsHome ? mine.w : theirs.w,
      homeLosses: teamIsHome ? mine.l : theirs.l,
      awayWins: teamIsHome ? theirs.w : mine.w,
      awayLosses: teamIsHome ? theirs.l : mine.l,
    });
    const inverse = `${(100 - parseFloat(odds.favoriteWinProbability)).toFixed(1)}%`;
    const { error: updErr } = await sb
      .from('game_preview')
      .update({
        team_overall: teamIsHome ? homeRatings.overall : awayRatings.overall,
        team_offense: teamIsHome ? homeRatings.offense : awayRatings.offense,
        team_defense: teamIsHome ? homeRatings.defense : awayRatings.defense,
        opponent_overall: String(teamIsHome ? awayRatings.overall : homeRatings.overall),
        opponent_offense: String(teamIsHome ? awayRatings.offense : homeRatings.offense),
        opponent_defense: String(teamIsHome ? awayRatings.defense : homeRatings.defense),
        favorite: odds.favorite,
        favorite_spread: String(odds.spread),
        favorite_moneyline: odds.favoriteMoneyline,
        total_over_under: odds.totalOverUnder,
        team_win_probability: odds.favorite === preview.team ? odds.favoriteWinProbability : inverse,
        opponent_win_probability: odds.favorite === preview.opponent ? odds.favoriteWinProbability : inverse,
      })
      .eq('id', preview.id);
    if (updErr) issues.push(`game_preview odds write failed (row ${preview.id}): ${updErr.message}`);
    else written++;
  }
  return { written, issues };
}

/**
 * Networks for the whole week's slate at once (best_matchups + every member's
 * game), because a pick depends on which other games share a time slot.
 * A game with no kickoff time still gets a network (it lands in the engine's
 * "unknown time" bucket) rather than being left blank.
 */
export async function runBroadcastEngine({
  sb,
  scope,
  ratingsByName,
  conferenceByName,
}: {
  sb: SupabaseClient;
  scope: PreviewScope;
  ratingsByName: RatingsByName;
  conferenceByName: ConferenceByName;
}): Promise<{ assigned: number; issues: string[]; error?: string }> {
  const toSlateTeam = (name: string | null): SlateTeam | null => {
    const r = lookupRating(ratingsByName, name);
    if (!name || !r) return null;
    return { name, overall: r.overall, conference: conferenceByName[name] ?? null };
  };

  const games: SlateGame[] = [];
  const issues: string[] = [];

  const { data: matchupRows, error: matchupErr } = await sb
    .from('best_matchups')
    .select('id, home_team, away_team, time')
    .eq('dynasty_id', scope.dynastyId)
    .eq('season', scope.season)
    .eq('week', scope.week);
  if (matchupErr) return { assigned: 0, issues, error: `best_matchups: ${matchupErr.message}` };

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
    .eq('dynasty_id', scope.dynastyId)
    .eq('season', scope.season)
    .eq('week', scope.week);
  if (previewErr) return { assigned: 0, issues, error: `game_preview: ${previewErr.message}` };

  // Both sides of a user-vs-user matchup each have a row; only the first is
  // slated and both rows get the same network.
  const seenPairs = new Set<string>();
  const previewIdsByPair = new Map<string, number[]>();
  for (const preview of previewRows || []) {
    if (!preview.team || !preview.opponent) continue;
    const pair = [preview.team, preview.opponent].sort().join('|');
    previewIdsByPair.set(pair, (previewIdsByPair.get(pair) || []).concat(preview.id));
    if (seenPairs.has(pair)) continue;
    seenPairs.add(pair);
    const homeName = preview.home_team || preview.team;
    const awayName = homeName === preview.team ? preview.opponent : preview.team;
    const home = toSlateTeam(homeName);
    const away = toSlateTeam(awayName);
    if (home && away) {
      games.push({ id: `game_preview:${preview.id}`, homeTeam: home, awayTeam: away, time: preview.game_time || null });
    } else {
      issues.push(`game_preview row ${preview.id} has no network — no rating for "${!home ? homeName : awayName}"`);
    }
  }

  if (games.length === 0) return { assigned: 0, issues };

  const assignments = assignBroadcasts(games);
  for (const a of assignments) {
    const [table, idStr] = a.id.split(':');
    const id = Number(idStr);
    const column = table === 'game_preview' ? 'game_broadcast' : 'broadcast';
    let ids = [id];
    if (table === 'game_preview') {
      for (const group of previewIdsByPair.values()) if (group.indexOf(id) > -1) ids = group;
    }
    const { error } = await sb.from(table).update({ [column]: a.broadcast }).in('id', ids);
    if (error) issues.push(`broadcast write failed for ${a.id}: ${error.message}`);
  }
  return { assigned: assignments.length, issues };
}

export interface PreviewCompletion {
  synced: number;
  oddsWritten: number;
  networksAssigned: number;
  /** Per-step detail in the same shape the upload-results card already renders. */
  steps: {
    sync: { inserted: number; updated: number; issues: string[]; error?: string };
    odds: { written: number; issues: string[]; error?: string };
    broadcast: { assigned: number; issues: string[]; error?: string };
  };
  /** Everything that left a preview incomplete, in plain words. Empty = all complete. */
  issues: string[];
}

/**
 * Builds/refreshes every active member's preview rows from their processed
 * schedules, then fills odds + win probability for the week and assigns the
 * networks. Idempotent.
 */
export async function completeWeekPreviews(sb: SupabaseClient, scope: PreviewScope): Promise<PreviewCompletion> {
  const steps: PreviewCompletion['steps'] = {
    sync: { inserted: 0, updated: 0, issues: [] },
    odds: { written: 0, issues: [] },
    broadcast: { assigned: 0, issues: [] },
  };
  const finish = (): PreviewCompletion => ({
    synced: steps.sync.inserted + steps.sync.updated,
    oddsWritten: steps.odds.written,
    networksAssigned: steps.broadcast.assigned,
    steps,
    issues: [
      ...(steps.sync.error ? [steps.sync.error] : []), ...steps.sync.issues,
      ...(steps.odds.error ? [steps.odds.error] : []), ...steps.odds.issues,
      ...(steps.broadcast.error ? [steps.broadcast.error] : []), ...steps.broadcast.issues,
    ],
  });

  const tables = await loadRatingTables(sb);
  if (tables.error) {
    steps.odds.error = tables.error;
    return finish();
  }

  const { data: members, error: memErr } = await sb.from('dynasty_members').select('user_id, team').eq('dynasty_id', scope.dynastyId).eq('status', 'active');
  if (memErr) steps.sync.error = `dynasty_members: ${memErr.message}`;
  for (const m of (members || []).filter((x: any) => x.team)) {
    try {
      const r = await syncGamePreviewFromSchedule(sb, { dynastyId: scope.dynastyId, userId: m.user_id, team: m.team, season: scope.season });
      steps.sync.inserted += r.inserted;
      steps.sync.updated += r.updated;
    } catch (err: any) {
      steps.sync.issues.push(`${m.team}: ${err?.message || String(err)}`);
    }
  }

  const odds = await runGamePreviewOdds({ sb, scope, ratingsByName: tables.ratingsByName, onlyTeam: null });
  steps.odds = odds;

  const bc = await runBroadcastEngine({ sb, scope, ratingsByName: tables.ratingsByName, conferenceByName: tables.conferenceByName });
  steps.broadcast = bc;

  return finish();
}
