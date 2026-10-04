import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getSupabase } from '@/lib/supabaseClient';
import { ACTIVE_COOKIE, getUser, unauthorized } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Who am I, which dynasties am I in, and which one is active?
export async function GET() {
  const user = await getUser();
  if (!user) return unauthorized();
  const sb = getSupabase();

  const { data: rows, error } = await sb
    .from('dynasty_members')
    .select('id, dynasty_id, role, team, status, dynasties(id, name, mode, current_season, live_week, claims_open, allow_pick, allow_random, reroll_limit)')
    .eq('user_id', user.id)
    .neq('status', 'removed');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const memberships = (rows || []).map((r: any) => {
    const d = Array.isArray(r.dynasties) ? r.dynasties[0] : r.dynasties;
    return { dynastyId: r.dynasty_id, role: r.role, team: r.team, status: r.status, dynasty: d };
  }).filter((m: any) => m.dynasty);

  const wanted = cookies().get(ACTIVE_COOKIE)?.value;
  const active = memberships.find((m: any) => m.dynastyId === wanted) || memberships[0] || null;

  let coachReady = false;
  if (active?.team) {
    const { data: coachRow } = await sb.from('my_coach').select('id, name, image_url').eq('dynasty_id', active.dynastyId).eq('user_id', user.id).eq('season', active.dynasty.current_season).maybeSingle();
    coachReady = !!(coachRow && coachRow.name && coachRow.image_url);
  }

  let teamInfo: any = null;
  if (active?.team) {
    const { data } = await sb.from('assets').select('team_name, team_conference, logo_url, primary_color').eq('team_name', active.team).maybeSingle();
    teamInfo = data;
  }

  return NextResponse.json({
    user: { id: user.id, email: user.email },
    memberships,
    displayName: String(user.user_metadata?.full_name || user.user_metadata?.name || '').slice(0, 40),
    active: active ? { ...active, teamInfo, coachReady } : null,
  });
}
