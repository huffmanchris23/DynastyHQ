import { NextRequest, NextResponse } from 'next/server';
import { requireMemberCtx, peopleOf, syncUserGames } from '@/lib/community';
import { getSupabase } from '@/lib/supabaseClient';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Countdown + this week's user-vs-user games (created on first view if missing).
export async function GET() {
  const r = await requireMemberCtx();
  if ('res' in r) return r.res;
  const { ctx } = r;
  const sb = getSupabase();
  const { data: d } = await sb.from('dynasties').select('countdown_ends_at, week_length_hours').eq('id', ctx.dynastyId).single();

  const week = ctx.liveWeek;
  const people = await peopleOf(ctx);
  const byTeam = new Map(people.map((p) => [p.team as string, p]));
  const games = week === null ? [] : await syncUserGames(ctx, week);

  return NextResponse.json({
    isCommish: ctx.isCommish, me: ctx.userId, myTeam: ctx.team,
    liveWeek: week, countdownEndsAt: d?.countdown_ends_at ?? null, weekLengthHours: d?.week_length_hours ?? null,
    games: games.map((g: any) => ({
      id: g.id, week: g.week, status: g.status, winner: g.winner, scheduledFor: g.scheduled_for, threadId: g.thread_id,
      a: { team: g.team_a, name: byTeam.get(g.team_a)?.name || '', logo: byTeam.get(g.team_a)?.logo || null, userId: byTeam.get(g.team_a)?.userId || null },
      b: { team: g.team_b, name: byTeam.get(g.team_b)?.name || '', logo: byTeam.get(g.team_b)?.logo || null, userId: byTeam.get(g.team_b)?.userId || null },
    })),
  });
}

// Members: { gameId, action: 'agree_sim' } posts their agreement in the game's thread.
// Commish:  { gameId, action: 'scheduled' | 'played' | 'simmed' | 'unscheduled' | 'forfeit', winner? }
export async function POST(req: NextRequest) {
  const r = await requireMemberCtx();
  if ('res' in r) return r.res;
  const { ctx } = r;
  const b = await req.json().catch(() => ({}));
  const sb = getSupabase();

  const { data: g } = await sb.from('user_games').select('*').eq('id', b.gameId).eq('dynasty_id', ctx.dynastyId).maybeSingle();
  if (!g) return NextResponse.json({ error: 'Game not found.' }, { status: 404 });
  const involved = ctx.team === g.team_a || ctx.team === g.team_b;

  const say = async (text: string) => {
    if (g.thread_id) await sb.from('posts').insert({ dynasty_id: ctx.dynastyId, thread_id: g.thread_id, author_id: null, body: text });
  };

  if (b.action === 'agree_sim') {
    if (!involved) return NextResponse.json({ error: 'Only the two coaches in this game can agree to a sim.' }, { status: 403 });
    await say(`${ctx.team} agrees to sim this game.`);
    return NextResponse.json({ ok: true });
  }

  if (!ctx.isCommish) return NextResponse.json({ error: 'Only the commissioner can change a game.' }, { status: 403 });
  const allowed = ['unscheduled', 'scheduled', 'played', 'simmed', 'forfeit'];
  if (allowed.indexOf(b.action) === -1) return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
  let winner: string | null = null;
  if (b.action === 'forfeit') {
    if (b.winner !== g.team_a && b.winner !== g.team_b) return NextResponse.json({ error: 'Choose which team gets the win.' }, { status: 400 });
    winner = b.winner;
  }
  const { error } = await sb.from('user_games').update({ status: b.action, winner, decided_by: ctx.userId, updated_at: new Date().toISOString() }).eq('id', g.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await say(b.action === 'forfeit' ? `Commissioner ruling: forfeit. ${winner} gets the win.` : `Commissioner marked this game ${b.action}.`);
  return NextResponse.json({ ok: true });
}
