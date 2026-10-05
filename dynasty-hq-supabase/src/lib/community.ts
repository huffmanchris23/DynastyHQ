/**
 * Shared helpers for the Community tab API routes. Every route authenticates
 * the caller, resolves their active dynasty, and checks membership/role here —
 * data access afterwards uses the service-role client, so these checks ARE the
 * access rules for this tab.
 */
import { NextResponse } from 'next/server';
import { getSupabase } from './supabaseClient';
import { getUser } from './auth';
import { getDynastyCtx, type DynastyCtx } from './dynastyContext';

export async function requireMemberCtx(): Promise<{ ctx: DynastyCtx } | { res: NextResponse }> {
  const user = await getUser();
  if (!user) return { res: NextResponse.json({ error: 'Sign in required.' }, { status: 401 }) };
  const ctx = await getDynastyCtx(user.id);
  if (!ctx) return { res: NextResponse.json({ error: 'Join a dynasty first.' }, { status: 409 }) };
  return { ctx };
}

export interface PersonInfo { userId: string; name: string; team: string | null; position: string | null; role: string; logo: string | null; image: string | null }

/** Everyone in the dynasty with a display name (coach name > profile name), team, coach position, and logo. */
export async function peopleOf(ctx: DynastyCtx, includeRemoved = false): Promise<PersonInfo[]> {
  const sb = getSupabase();
  let mq = sb.from('dynasty_members').select('user_id, team, role, status, profiles(display_name)').eq('dynasty_id', ctx.dynastyId);
  if (!includeRemoved) mq = mq.neq('status', 'removed');
  const [{ data: members }, { data: coaches }, { data: assets }] = await Promise.all([
    mq,
    sb.from('my_coach').select('user_id, name, title, image_url').eq('dynasty_id', ctx.dynastyId).eq('season', ctx.season),
    sb.from('assets').select('team_name, logo_url'),
  ]);
  const coachBy = new Map<string, any>((coaches || []).map((c: any) => [c.user_id, c]));
  const logoBy = new Map<string, string>((assets || []).map((a: any) => [a.team_name, a.logo_url]));
  return (members || []).map((m: any) => {
    const prof = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles;
    const c = coachBy.get(m.user_id);
    return {
      userId: m.user_id,
      name: (c?.name || prof?.display_name || 'Coach') as string,
      team: m.team,
      position: c?.title || null,
      role: m.role,
      logo: m.team ? logoBy.get(m.team) || null : null,
      image: c?.image_url || null,
    };
  });
}

/** lowercased spelling of a team (any on-screen variant) -> canonical team_name */
export async function teamNameResolver(): Promise<(raw: string) => string | null> {
  const { data } = await getSupabase().from('ocr_helper').select('team_name, name_in_schedule, name_in_polls, name_in_playoffs, name_in_stats, name_in_preview, name_in_betting');
  const map = new Map<string, string>();
  (data || []).forEach((r: any) => {
    [r.team_name, r.name_in_schedule, r.name_in_polls, r.name_in_playoffs, r.name_in_stats, r.name_in_preview, r.name_in_betting].forEach((v) => {
      if (v) map.set(String(v).trim().toLowerCase(), r.team_name);
    });
  });
  return (raw: string) => map.get(String(raw || '').trim().toLowerCase()) || null;
}

/**
 * Finds user-vs-user games for a week (a member's opponent is another member's
 * team), creates any missing user_games rows plus a message-board thread for
 * each, and returns the week's games. Safe to call repeatedly.
 */
export async function syncUserGames(ctx: DynastyCtx, week: number) {
  const sb = getSupabase();
  const people = (await peopleOf(ctx)).filter((p) => p.team);
  const byTeam = new Map(people.map((p) => [p.team as string, p]));
  if (people.length < 2) return [];

  const resolve = await teamNameResolver();
  const { data: sched } = await sb.from('team_schedule').select('team, week, opponent')
    .eq('dynasty_id', ctx.dynastyId).eq('season', ctx.season).eq('week', week);

  const pairs = new Map<string, [string, string]>();
  (sched || []).forEach((r: any) => {
    const opp = resolve(r.opponent);
    if (!opp || !byTeam.has(opp) || !byTeam.has(r.team) || opp === r.team) return;
    const [a, b] = [r.team, opp].sort();
    pairs.set(`${a}|${b}`, [a, b]);
  });

  const { data: existing } = await sb.from('user_games').select('*').eq('dynasty_id', ctx.dynastyId).eq('season', ctx.season).eq('week', week);
  const have = new Set((existing || []).map((g: any) => `${g.team_a}|${g.team_b}`));

  for (const [key, [a, b]] of Array.from(pairs.entries())) {
    if (have.has(key)) continue;
    const pa = byTeam.get(a)!, pb = byTeam.get(b)!;
    const { data: thread } = await sb.from('threads').insert({
      dynasty_id: ctx.dynastyId, kind: 'user_game', created_by: null,
      title: `Week ${week}: ${a} vs ${b}`,
    }).select('id').single();
    if (thread) {
      await sb.from('posts').insert({
        dynasty_id: ctx.dynastyId, thread_id: thread.id, author_id: null,
        body: `${pa.name} (${a}) and ${pb.name} (${b}) play each other this week. Find a time that works for both of you, or agree to sim it. The commissioner makes the final call.`,
      });
    }
    await sb.from('user_games').insert({
      dynasty_id: ctx.dynastyId, season: ctx.season, week, team_a: a, team_b: b, thread_id: thread?.id ?? null,
    });
  }

  const { data: games } = await sb.from('user_games').select('*').eq('dynasty_id', ctx.dynastyId).eq('season', ctx.season).eq('week', week).order('created_at');
  return games || [];
}
