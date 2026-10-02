import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabaseClient';
import { fail, getUser, setActiveCookie, unauthorized } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Redeem an invite code: becomes a member with no team yet (claims next).
export async function POST(req: NextRequest) {
  const user = await getUser();
  if (!user) return unauthorized();
  const { code: raw } = await req.json().catch(() => ({}));
  const code = String(raw || '').trim().toUpperCase();
  if (!code) return fail(400, 'Enter an invite code.');

  const sb = getSupabase();
  const { data: inv } = await sb.from('invites').select('*').eq('code', code).maybeSingle();
  if (!inv || inv.revoked) return fail(404, 'That invite code is not valid.');
  if (inv.expires_at && new Date(inv.expires_at) < new Date()) return fail(410, 'That invite has expired.');
  if (inv.max_uses != null && inv.uses >= inv.max_uses) return fail(410, 'That invite has been used up.');

  const { data: dynasty } = await sb.from('dynasties').select('id, name, mode, status').eq('id', inv.dynasty_id).single();
  if (!dynasty || dynasty.status !== 'active') return fail(404, 'That dynasty is no longer active.');
  if (dynasty.mode !== 'multi') return fail(400, 'That dynasty is not accepting members.');

  const { data: existing } = await sb.from('dynasty_members').select('id, status').eq('dynasty_id', dynasty.id).eq('user_id', user.id).maybeSingle();
  if (existing?.status === 'removed') return fail(403, 'You cannot rejoin this dynasty.');
  if (!existing) {
    await sb.from('profiles').upsert({ id: user.id, display_name: (user.email || '').split('@')[0] }, { onConflict: 'id', ignoreDuplicates: true });
    const { error } = await sb.from('dynasty_members').insert({ dynasty_id: dynasty.id, user_id: user.id, role: 'member', status: 'active' });
    if (error) return fail(500, error.message);
    await sb.from('invites').update({ uses: inv.uses + 1 }).eq('id', inv.id).eq('uses', inv.uses);
  }
  return setActiveCookie(NextResponse.json({ dynastyId: dynasty.id, name: dynasty.name }), dynasty.id);
}
