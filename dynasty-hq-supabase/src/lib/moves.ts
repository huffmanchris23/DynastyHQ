/**
 * Moves a coach to a different team. League data belongs to the TEAM and season,
 * not the person, so only the membership pointer changes; the team history log
 * records the old and new stint. Moves only happen between weeks (no open upload
 * cycle) so a half-uploaded week is never split across two teams.
 */
import { getSupabase } from './supabaseClient';
import type { DynastyCtx } from './dynastyContext';
import { openWeekOf } from './ocrShared';
import { allTeams } from './teamPool';

export async function applyMove(
  ctx: DynastyCtx, userId: string, toTeam: string, reason: 'new_job' | 'reassigned'
): Promise<{ ok: true } | { error: string; status: number }> {
  if (openWeekOf(ctx) !== null) return { error: 'A week is open for uploads. Moves can happen once it goes live.', status: 409 };
  const sb = getSupabase();
  const teams = await allTeams();
  if (!teams.some((t) => t.team_name === toTeam)) return { error: 'That team does not exist.', status: 400 };

  const { data: m } = await sb.from('dynasty_members').select('*').eq('dynasty_id', ctx.dynastyId).eq('user_id', userId).neq('status', 'removed').maybeSingle();
  if (!m) return { error: 'That coach is not in this dynasty.', status: 404 };
  if (m.team === toTeam) return { error: 'That coach already has that team.', status: 400 };

  const { error } = await sb.from('dynasty_members').update({ team: toTeam, status: 'active' }).eq('id', m.id);
  if (error) return error.code === '23505' ? { error: 'Another coach already has that team.', status: 409 } : { error: error.message, status: 500 };

  const week = ctx.liveWeek;
  if (m.team) {
    await sb.from('team_history').update({ end_season: ctx.season, end_week: week })
      .eq('dynasty_id', ctx.dynastyId).eq('user_id', userId).eq('team', m.team).is('end_season', null);
  }
  await sb.from('team_history').insert({ dynasty_id: ctx.dynastyId, user_id: userId, team: toTeam, start_season: ctx.season, start_week: week, reason });
  return { ok: true };
}
