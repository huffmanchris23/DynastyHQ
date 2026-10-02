/**
 * Which teams can a member claim? Commish-set pool rules, minus teams that
 * already have an active user. The commish ignores the pool (can take any
 * unclaimed team). Rules (team_pool jsonb):
 *   conferences: string[]   - empty = any conference
 *   min_overall/max_overall - team overall rating bounds
 *   teams: string[]         - if non-empty, ONLY these teams (hand-picked list)
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

export async function teamsForDynasty(dynasty: any, ignorePool: boolean) {
  const sb = getSupabase();
  const [{ data: assets }, { data: held }] = await Promise.all([
    sb.from('assets').select('team_name, team_conference, team_overall, logo_url').order('team_name'),
    sb.from('dynasty_members').select('team, user_id').eq('dynasty_id', dynasty.id).eq('status', 'active').not('team', 'is', null),
  ]);
  const taken = new Set((held || []).map((h: any) => h.team));
  const pool: TeamPool = ignorePool ? {} : (dynasty.team_pool || {});
  const all = (assets || []) as PoolTeam[];
  const inPool = all.filter((t) => {
    if (pool.teams && pool.teams.length) return pool.teams.indexOf(t.team_name) > -1;
    if (pool.conferences && pool.conferences.length && pool.conferences.indexOf(t.team_conference || '') === -1) return false;
    if (pool.min_overall != null && (t.team_overall ?? 0) < pool.min_overall) return false;
    if (pool.max_overall != null && (t.team_overall ?? 0) > pool.max_overall) return false;
    return true;
  });
  return {
    available: inPool.filter((t) => !taken.has(t.team_name)),
    takenNames: Array.from(taken) as string[],
    allTeamNames: all.map((t) => t.team_name),
  };
}
