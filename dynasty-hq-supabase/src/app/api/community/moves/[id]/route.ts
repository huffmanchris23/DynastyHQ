import { NextRequest, NextResponse } from 'next/server';
import { requireMemberCtx } from '@/lib/community';
import { getSupabase } from '@/lib/supabaseClient';
import { applyMove } from '@/lib/moves';
import { notify } from '@/lib/notify';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// { action: 'approve' | 'deny' } (commish) or { action: 'cancel' } (the requester)
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const r = await requireMemberCtx();
  if ('res' in r) return r.res;
  const { ctx } = r;
  const b = await req.json().catch(() => ({}));
  const sb = getSupabase();

  const { data: m } = await sb.from('job_move_requests').select('*').eq('id', params.id).eq('dynasty_id', ctx.dynastyId).maybeSingle();
  if (!m) return NextResponse.json({ error: 'Request not found.' }, { status: 404 });
  if (m.status !== 'pending') return NextResponse.json({ error: 'That request was already handled.' }, { status: 409 });

  if (b.action === 'cancel') {
    if (m.user_id !== ctx.userId) return NextResponse.json({ error: 'That is not your request.' }, { status: 403 });
    await sb.from('job_move_requests').update({ status: 'cancelled', decided_at: new Date().toISOString() }).eq('id', m.id);
    return NextResponse.json({ ok: true });
  }

  if (!ctx.isCommish) return NextResponse.json({ error: 'Only the commissioner can decide requests.' }, { status: 403 });

  if (b.action === 'deny') {
    await sb.from('job_move_requests').update({ status: 'denied', decided_by: ctx.userId, decided_at: new Date().toISOString() }).eq('id', m.id);
    await notify([m.user_id], { dynastyId: ctx.dynastyId, type: 'move_denied', title: `Your move to ${m.to_team} was not approved`, nav: { tab: 'community', subtab: 'users' } });
    return NextResponse.json({ ok: true });
  }

  if (b.action === 'approve') {
    const out = await applyMove(ctx, m.user_id, m.to_team, 'new_job');
    if ('error' in out) return NextResponse.json({ error: out.error }, { status: out.status });
    await sb.from('job_move_requests').update({ status: 'approved', decided_by: ctx.userId, decided_at: new Date().toISOString() }).eq('id', m.id);
    await notify([m.user_id], { dynastyId: ctx.dynastyId, type: 'move_approved', title: `You are now the coach of ${m.to_team}`, nav: { tab: 'home' } });
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
}
