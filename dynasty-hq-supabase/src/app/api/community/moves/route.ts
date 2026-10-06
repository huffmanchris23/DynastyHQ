import { NextRequest, NextResponse } from 'next/server';
import { requireMemberCtx, peopleOf } from '@/lib/community';
import { getSupabase } from '@/lib/supabaseClient';
import { applyMove } from '@/lib/moves';
import { commishIds, notify } from '@/lib/notify';
import { openWeekOf } from '@/lib/ocrShared';
import { allTeams, inPool } from '@/lib/teamPool';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// My requests (and, for the commissioner, everyone's pending requests).
export async function GET() {
  const r = await requireMemberCtx();
  if ('res' in r) return r.res;
  const { ctx } = r;
  const sb = getSupabase();
  const people = await peopleOf(ctx, true);
  const by = new Map(people.map((p) => [p.userId, p]));

  const { data: mine } = await sb.from('job_move_requests').select('*').eq('dynasty_id', ctx.dynastyId).eq('user_id', ctx.userId).order('created_at', { ascending: false }).limit(5);
  let pending: any[] = [];
  if (ctx.isCommish) {
    const { data } = await sb.from('job_move_requests').select('*').eq('dynasty_id', ctx.dynastyId).eq('status', 'pending').order('created_at');
    pending = (data || []).map((m: any) => ({ id: m.id, userId: m.user_id, name: by.get(m.user_id)?.name || 'Coach', fromTeam: m.from_team, toTeam: m.to_team, note: m.note, createdAt: m.created_at }));
  }
  return NextResponse.json({
    isCommish: ctx.isCommish,
    movesOpen: openWeekOf(ctx) === null,
    mine: (mine || []).map((m: any) => ({ id: m.id, fromTeam: m.from_team, toTeam: m.to_team, status: m.status, createdAt: m.created_at })),
    pending,
  });
}

// Member: { toTeam, note? } files a request.  Commish: { userId, toTeam } moves someone right away.
export async function POST(req: NextRequest) {
  const r = await requireMemberCtx();
  if ('res' in r) return r.res;
  const { ctx } = r;
  const b = await req.json().catch(() => ({}));
  const sb = getSupabase();
  const toTeam = String(b.toTeam || '');
  if (!toTeam) return NextResponse.json({ error: 'Choose a team.' }, { status: 400 });

  if (b.userId && b.userId !== ctx.userId) {
    if (!ctx.isCommish) return NextResponse.json({ error: 'Only the commissioner can move other coaches.' }, { status: 403 });
    const out = await applyMove(ctx, b.userId, toTeam, 'reassigned');
    if ('error' in out) return NextResponse.json({ error: out.error }, { status: out.status });
    return NextResponse.json({ ok: true, moved: true });
  }

  if (!ctx.team) return NextResponse.json({ error: 'You do not have a team to move from.' }, { status: 400 });
  const teams = await allTeams();
  const target = teams.find((t) => t.team_name === toTeam);
  if (!target) return NextResponse.json({ error: 'That team does not exist.' }, { status: 400 });
  if (toTeam === ctx.team) return NextResponse.json({ error: 'You already coach that team.' }, { status: 400 });

  const { data: d } = await sb.from('dynasties').select('team_pool').eq('id', ctx.dynastyId).single();
  if (!ctx.isCommish && !inPool(target, d?.team_pool || {})) return NextResponse.json({ error: 'That team is outside this dynasty\'s allowed pool. Ask your commissioner.' }, { status: 403 });
  const { data: taken } = await sb.from('dynasty_members').select('id').eq('dynasty_id', ctx.dynastyId).eq('team', toTeam).eq('status', 'active').maybeSingle();
  if (taken) return NextResponse.json({ error: 'Another coach already has that team.' }, { status: 409 });
  const { data: existing } = await sb.from('job_move_requests').select('id').eq('dynasty_id', ctx.dynastyId).eq('user_id', ctx.userId).eq('status', 'pending').maybeSingle();
  if (existing) return NextResponse.json({ error: 'You already have a request waiting. Cancel it first to send a new one.' }, { status: 409 });

  const note = b.note ? String(b.note).slice(0, 200) : null;
  const { error } = await sb.from('job_move_requests').insert({ dynasty_id: ctx.dynastyId, user_id: ctx.userId, from_team: ctx.team, to_team: toTeam, note, status: 'pending' });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const people = await peopleOf(ctx);
  const me = people.find((p) => p.userId === ctx.userId);
  await notify(await commishIds(ctx.dynastyId), { dynastyId: ctx.dynastyId, type: 'move_request', title: `${me?.name || 'A coach'} wants to move to ${toTeam}`, body: `Currently ${ctx.team}.`, nav: { tab: 'community', subtab: 'users' } });
  return NextResponse.json({ ok: true });
}
