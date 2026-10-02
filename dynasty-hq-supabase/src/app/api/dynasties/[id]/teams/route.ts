import { NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabaseClient';
import { fail, getDynasty, getMember, getUser, isCommish, unauthorized } from '@/lib/auth';
import { teamsForDynasty } from '@/lib/teamPool';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Teams this person can claim right now, plus the claim rules that apply to them.
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const user = await getUser();
  if (!user) return unauthorized();
  const member = await getMember(params.id, user.id);
  if (!member) return fail(403, 'You are not a member of that dynasty.');
  const dynasty = await getDynasty(params.id);
  if (!dynasty) return fail(404, 'Dynasty not found.');

  const commish = isCommish(member);
  const { available } = await teamsForDynasty(dynasty, commish);

  const { count } = await getSupabase()
    .from('team_history').select('id', { count: 'exact', head: true })
    .eq('dynasty_id', params.id).eq('user_id', user.id).eq('reason', 'random');
  const rerollsUsed = Math.max(0, (count || 0) - 1);

  return NextResponse.json({
    available,
    commish,
    myTeam: member.team,
    rules: {
      claimsOpen: dynasty.claims_open,
      allowPick: commish ? true : dynasty.allow_pick,
      allowRandom: commish ? false : dynasty.allow_random,
      rerollLimit: dynasty.reroll_limit,
      rerollsLeft: Math.max(0, dynasty.reroll_limit - rerollsUsed),
    },
  });
}
