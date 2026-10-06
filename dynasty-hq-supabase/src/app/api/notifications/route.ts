import { NextRequest, NextResponse } from 'next/server';
import { getUser, unauthorized } from '@/lib/auth';
import { getSupabase } from '@/lib/supabaseClient';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ?count=1 -> just the unread count (cheap, polled). Otherwise the latest 30.
export async function GET(req: NextRequest) {
  const user = await getUser();
  if (!user) return unauthorized();
  const sb = getSupabase();
  if (req.nextUrl.searchParams.get('count')) {
    const { count } = await sb.from('notifications').select('id', { count: 'exact', head: true }).eq('user_id', user.id).is('read_at', null);
    return NextResponse.json({ unread: count || 0 });
  }
  const { data } = await sb.from('notifications').select('id, type, title, body, data, read_at, created_at, dynasty_id').eq('user_id', user.id).order('created_at', { ascending: false }).limit(30);
  const unread = (data || []).filter((n: any) => !n.read_at).length;
  return NextResponse.json({ unread, items: data || [] });
}

// { action: 'read', id } | { action: 'read_all' }
export async function POST(req: NextRequest) {
  const user = await getUser();
  if (!user) return unauthorized();
  const b = await req.json().catch(() => ({}));
  const sb = getSupabase();
  const now = new Date().toISOString();
  if (b.action === 'read_all') await sb.from('notifications').update({ read_at: now }).eq('user_id', user.id).is('read_at', null);
  else if (b.action === 'read' && b.id) await sb.from('notifications').update({ read_at: now }).eq('user_id', user.id).eq('id', b.id);
  else return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
  return NextResponse.json({ ok: true });
}
