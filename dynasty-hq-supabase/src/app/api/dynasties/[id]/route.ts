import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabaseClient';
import { fail, getMember, getUser, isCommish, unauthorized } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Commish edits dynasty settings and claim rules.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getUser();
  if (!user) return unauthorized();
  if (!isCommish(await getMember(params.id, user.id))) return fail(403, 'Only the commissioner can change dynasty settings.');

  const b = await req.json().catch(() => ({}));
  const patch: Record<string, any> = {};
  if (typeof b.name === 'string' && b.name.trim().length >= 2) patch.name = b.name.trim().slice(0, 60);
  if (b.mode === 'solo' || b.mode === 'multi') patch.mode = b.mode;
  if (typeof b.claims_open === 'boolean') patch.claims_open = b.claims_open;
  if (typeof b.allow_pick === 'boolean') patch.allow_pick = b.allow_pick;
  if (typeof b.allow_random === 'boolean') patch.allow_random = b.allow_random;
  if (b.reroll_limit != null) patch.reroll_limit = Math.max(0, Math.min(10, Number(b.reroll_limit) || 0));
  if (b.week_length_hours != null) patch.week_length_hours = Math.max(1, Math.min(24 * 14, Number(b.week_length_hours) || 72));
  if (b.team_pool && typeof b.team_pool === 'object') patch.team_pool = b.team_pool;
  if (!Object.keys(patch).length) return fail(400, 'Nothing to update.');

  const { error } = await getSupabase().from('dynasties').update(patch).eq('id', params.id);
  if (error) return fail(500, error.message);
  return NextResponse.json({ ok: true });
}
