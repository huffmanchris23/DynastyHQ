/**
 * Who is asking, which dynasty are they looking at, and what are they allowed
 * to see? Single place that answers it for the dashboard (and, in step 3b, the
 * upload/process routes). Data access uses the service-role client, so the
 * week gate that the database policies express is applied HERE in code too.
 */
import { cookies } from 'next/headers';
import { getSupabase } from './supabaseClient';
import { ACTIVE_COOKIE } from './auth';

export interface DynastyCtx {
  dynastyId: string;
  dynastyName: string;
  mode: 'solo' | 'multi';
  userId: string;
  memberId: string;
  role: string;
  isCommish: boolean;
  team: string | null;
  season: number;
  /** Highest week this person may see: live week for members, staged week (preview) for the commish. null = nothing published yet. */
  week: number | null;
  liveWeek: number | null;
  stagedWeek: number | null;
}

export async function getDynastyCtx(userId: string): Promise<DynastyCtx | null> {
  const sb = getSupabase();
  const { data: rows } = await sb
    .from('dynasty_members')
    .select('id, dynasty_id, role, team, status')
    .eq('user_id', userId)
    .neq('status', 'removed');
  const memberships = rows || [];
  if (!memberships.length) return null;

  const wanted = cookies().get(ACTIVE_COOKIE)?.value;
  const m = memberships.find((r: any) => r.dynasty_id === wanted) || memberships[0];

  const { data: d } = await sb.from('dynasties').select('*').eq('id', m.dynasty_id).maybeSingle();
  if (!d) return null;

  const isCommish = (m.role === 'commish' || m.role === 'co_commish') && m.status === 'active';
  const week = isCommish ? (d.staged_week ?? d.live_week ?? null) : (d.live_week ?? null);

  return {
    dynastyId: d.id,
    dynastyName: d.name,
    mode: d.mode,
    userId,
    memberId: m.id,
    role: m.role,
    isCommish,
    team: m.team,
    season: d.current_season,
    week,
    liveWeek: d.live_week ?? null,
    stagedWeek: d.staged_week ?? null,
  };
}
