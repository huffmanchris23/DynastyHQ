import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabaseClient';
import { fail, getDynasty, getMember, getUser, isCommish, unauthorized } from '@/lib/auth';
import { teamsForDynasty } from '@/lib/teamPool';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Claim a team: { action: 'pick', team } | { action: 'random' } | { action: 'reroll' }.
 * The database's one-active-user-per-team index is the final referee: if two
 * people claim at once, the second insert fails (23505) and gets a clear message
 * (pick) or a fresh draw (random).
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getUser();
  if (!user) return unauthorized();
  const member = await getMember(params.id, user.id);
  if (!member) return fail(403, 'You are not a member of that dynasty.');
  const dynasty = await getDynasty(params.id);
  if (!dynasty) return fail(404, 'Dynasty not found.');

  const commish = isCommish(member);
  if (!dynasty.claims_open && !commish) return fail(403, 'Team claiming is closed. Ask your commissioner.');

  const { action, team } = await req.json().catch(() => ({}));
  const sb = getSupabase();

  const { count } = await sb.from('team_history').select('id', { count: 'exact', head: true })
    .eq('dynasty_id', params.id).eq('user_id', user.id).eq('reason', 'random');
  const rerollsUsed = Math.max(0, (count || 0) - 1);

  let reason: 'claimed' | 'random' = 'claimed';
  if (action === 'pick') {
    if (member.team) return fail(400, 'You already have a team.');
    if (!commish && !dynasty.allow_pick) return fail(403, 'Picking a team is turned off. Use the random draw.');
  } else if (action === 'random') {
    if (member.team) return fail(400, 'You already have a team.');
    if (commish || !dynasty.allow_random) return fail(403, 'Random draw is not available.');
    reason = 'random';
  } else if (action === 'reroll') {
    if (!member.team) return fail(400, 'Draw a team first.');
    if (commish || !dynasty.allow_random) return fail(403, 'Random draw is not available.');
    if (rerollsUsed >= dynasty.reroll_limit) return fail(403, 'No rerolls left.');
    reason = 'random';
  } else {
    return fail(400, 'Unknown action.');
  }

  const season = dynasty.current_season;
  const week = dynasty.live_week;

  // Reroll: release the current team first (and close its history row).
  if (action === 'reroll') {
    const old = member.team;
    const { error: relErr } = await sb.from('dynasty_members').update({ team: null }).eq('id', member.id);
    if (relErr) return fail(500, relErr.message);
    await sb.from('team_history').update({ end_season: season, end_week: week })
      .eq('dynasty_id', params.id).eq('user_id', user.id).eq('team', old).is('end_season', null);
  }

  const assign = async (t: string) => {
    const { error } = await sb.from('dynasty_members').update({ team: t, status: 'active' }).eq('id', member.id);
    return error;
  };

  let chosen: string | null = null;
  if (action === 'pick') {
    const { available } = await teamsForDynasty(dynasty, commish);
    if (!available.some((a) => a.team_name === team)) return fail(409, 'That team is not available.');
    const err = await assign(team);
    if (err) return fail(err.code === '23505' ? 409 : 500, err.code === '23505' ? 'Someone just took that team. Pick another.' : err.message);
    chosen = team;
  } else {
    // random / reroll: draw from the pool, retry if someone grabs it first
    for (let i = 0; i < 6 && !chosen; i++) {
      const { available } = await teamsForDynasty(dynasty, false);
      const options = available.filter((a) => a.team_name !== member.team || action !== 'reroll');
      if (!options.length) return fail(409, 'No teams are left in the pool.');
      const pick = options[Math.floor(Math.random() * options.length)].team_name;
      const err = await assign(pick);
      if (!err) chosen = pick;
      else if (err.code !== '23505') return fail(500, err.message);
    }
    if (!chosen) return fail(409, 'Could not draw a team. Try again.');
  }

  await sb.from('team_history').insert({
    dynasty_id: params.id, user_id: user.id, team: chosen,
    start_season: season, start_week: week, reason,
  });

  const rerollsLeft = reason === 'random' ? Math.max(0, dynasty.reroll_limit - (action === 'reroll' ? rerollsUsed + 1 : rerollsUsed)) : 0;
  return NextResponse.json({ team: chosen, rerollsLeft });
}
