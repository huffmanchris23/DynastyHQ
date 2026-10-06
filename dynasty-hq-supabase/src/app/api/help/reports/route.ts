import { NextRequest, NextResponse } from 'next/server';
import { getUser, unauthorized } from '@/lib/auth';
import { getSupabase } from '@/lib/supabaseClient';
import { getDynastyCtx } from '@/lib/dynastyContext';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DAILY_LIMIT = 10;

// My own bug reports and feature requests, with their status.
export async function GET() {
  const user = await getUser();
  if (!user) return unauthorized();
  const { data } = await getSupabase().from('reports').select('id, kind, title, status, created_at').eq('user_id', user.id).order('created_at', { ascending: false }).limit(20);
  return NextResponse.json({ reports: data || [] });
}

// { kind: 'bug' | 'feature', title, body, page? }
export async function POST(req: NextRequest) {
  const user = await getUser();
  if (!user) return unauthorized();
  const b = await req.json().catch(() => ({}));
  const kind = b.kind === 'feature' ? 'feature' : 'bug';
  const title = String(b.title || '').trim().slice(0, 120);
  const body = String(b.body || '').trim().slice(0, 3000);
  if (title.length < 3) return NextResponse.json({ error: 'Give it a short title.' }, { status: 400 });
  if (body.length < 5) return NextResponse.json({ error: 'Add a few details so it can be understood.' }, { status: 400 });

  const sb = getSupabase();
  const since = new Date(Date.now() - 86400000).toISOString();
  const { count } = await sb.from('reports').select('id', { count: 'exact', head: true }).eq('user_id', user.id).gte('created_at', since);
  if ((count || 0) >= DAILY_LIMIT) return NextResponse.json({ error: 'You have sent a lot of reports today. Please try again tomorrow.' }, { status: 429 });

  const ctx = await getDynastyCtx(user.id);
  const context = `\n\n---\nPage: ${String(b.page || 'unknown').slice(0, 80)}\nDynasty: ${ctx?.dynastyName || 'none'} (${ctx?.mode || '-'}) · Role: ${ctx?.role || '-'}\nDevice: ${String(req.headers.get('user-agent') || '').slice(0, 200)}`;
  const { error } = await sb.from('reports').insert({ kind, user_id: user.id, dynasty_id: ctx?.dynastyId || null, title, body: body + context });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
