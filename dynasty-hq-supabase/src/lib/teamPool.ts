/**
 * Which teams can a member claim? Commish-set pool rules, minus teams that
 * already have an active user. The commish ignores the pool (can take any
 * unclaimed team). Rules (team_pool jsonb):
 *   conferences: string[]   - empty = any conference
 *   min_overall/max_overall - team overall rating bounds
 *   teams: string[]         - if non-empty, ONLY these teams (hand-picked list)
 *
 * Ratings come from ocr_helper.overall_rating (a text column, populated for all
 * 138 teams). assets.team_overall is empty and must not be used.
 */
import { getSupabase } from './supabaseClient';

export interface TeamPool {
  conferences?: string[];
  min_overall?: number | null;
  max_overall?: number | null;
  teams?: string[];
}
export interface PoolTeam {
  team_name: string;
  team_conference: string | null;
  team_overall: number | null;
  logo_url: string | null;
}

/** All 138 teams with conference, logo, and starting overall rating. */
export async function allTeams(): Promise<PoolTeam[]> {
  const sb = getSupabase();
  const [{ data: assets }, { data: helper }] = await Promise.all([
    sb.from('assets').select('team_name, team_conference, logo_url').order('team_name'),
    sb.from('ocr_helper').select('team_name, overall_rating'),
  ]);
  const ovr = new Map<string, number>();
  (helper || []).forEach((h: any) => {
    const n = parseInt(String(h.overall_rating ?? ''), 10);
    if (!isNaN(n)) ovr.set(h.team_name, n);
  });
  return (assets || []).map((a: any) => ({
    team_name: a.team_name,
    team_conference: a.team_conference,
    logo_url: a.logo_url,
    team_overall: ovr.has(a.team_name) ? (ovr.get(a.team_name) as number) : null,
  }));
}

export function inPool(t: PoolTeam, pool: TeamPool): boolean {
  if (pool.teams && pool.teams.length) return pool.teams.indexOf(t.team_name) > -1;
  if (pool.conferences && pool.conferences.length && pool.conferences.indexOf(t.team_conference || '') === -1) return false;
  // A team with no known rating is never silently excluded by a rating filter.
  if (t.team_overall !== null) {
    if (pool.min_overall != null && t.team_overall < pool.min_overall) return false;
    if (pool.max_overall != null && t.team_overall > pool.max_overall) return false;
  }
  return true;
}

export async function teamsForDynasty(dynasty: any, ignorePool: boolean) {
  const sb = getSupabase();
  const [all, { data: held }] = await Promise.all([
    allTeams(),
    sb.from('dynasty_members').select('team, user_id').eq('dynasty_id', dynasty.id).eq('status', 'active').not('team', 'is', null),
  ]);
  const taken = new Set((held || []).map((h: any) => h.team));
  const pool: TeamPool = ignorePool ? {} : (dynasty.team_pool || {});
  const eligible = all.filter((t) => inPool(t, pool));
  return {
    available: eligible.filter((t) => !taken.has(t.team_name)),
    takenNames: Array.from(taken) as string[],
    allTeamNames: all.map((t) => t.team_name),
  };
}
