import { NextRequest, NextResponse } from 'next/server';
import { requireMemberCtx } from '@/lib/community';
import { getSupabase } from '@/lib/supabaseClient';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const r = await requireMemberCtx();
  if ('res' in r) return r.res;
  const { ctx } = r;
  const sb = getSupabase();
  const [{ data: rules }, { data: d }] = await Promise.all([
    sb.from('dynasty_rules').select('body, updated_at').eq('dynasty_id', ctx.dynastyId).maybeSingle(),
    sb.from('dynasties').select('week_length_hours, allow_pick, allow_random, reroll_limit, claims_open, team_pool').eq('id', ctx.dynastyId).single(),
  ]);
  return NextResponse.json({
    dynastyId: ctx.dynastyId,
    canEdit: ctx.isCommish,
    body: rules?.body || '',
    updatedAt: rules?.updated_at || null,
    weekLengthHours: d?.week_length_hours ?? null,
    teamSelection: d
      ? { claimsOpen: d.claims_open, allowPick: d.allow_pick, allowRandom: d.allow_random, rerollLimit: d.reroll_limit, pool: d.team_pool || {} }
      : null,
  });
}

// Commish edits the rules text.
export async function PUT(req: NextRequest) {
  const r = await requireMemberCtx();
  if ('res' in r) return r.res;
  const { ctx } = r;
  if (!ctx.isCommish) return NextResponse.json({ error: 'Only the commissioner can edit the rules.' }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const body = String(b.body ?? '').slice(0, 6000);
  const { error } = await getSupabase().from('dynasty_rules').upsert({ dynasty_id: ctx.dynastyId, body, updated_by: ctx.userId, updated_at: new Date().toISOString() });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
