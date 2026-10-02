import { NextRequest, NextResponse } from 'next/server';
import { randomInt } from 'crypto';
import { getSupabase } from '@/lib/supabaseClient';
import { fail, getMember, getUser, isCommish, unauthorized } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I

function makeCode() {
  let c = '';
  for (let i = 0; i < 8; i++) c += ALPHABET[randomInt(ALPHABET.length)];
  return c;
}

// Commish creates an invite code/link.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getUser();
  if (!user) return unauthorized();
  if (!isCommish(await getMember(params.id, user.id))) return fail(403, 'Only the commissioner can create invites.');

  const sb = getSupabase();
  const { data: d } = await sb.from('dynasties').select('mode').eq('id', params.id).single();
  if (d?.mode !== 'multi') return fail(400, 'Switch this dynasty to multi-user before inviting people.');

  const b = await req.json().catch(() => ({}));
  const days = Number(b.expiresInDays) || 0;
  const maxUses = Number(b.maxUses) || null;

  for (let i = 0; i < 5; i++) {
    const { data, error } = await sb.from('invites').insert({
      dynasty_id: params.id, code: makeCode(), created_by: user.id,
      expires_at: days > 0 ? new Date(Date.now() + days * 86400000).toISOString() : null,
      max_uses: maxUses,
    }).select('code, expires_at, max_uses').single();
    if (!error && data) return NextResponse.json(data);
    if (error && error.code !== '23505') return fail(500, error.message);
  }
  return fail(500, 'Could not generate a code. Try again.');
}
