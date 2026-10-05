import { NextRequest, NextResponse } from 'next/server';
import { requireMemberCtx, peopleOf } from '@/lib/community';
import { getSupabase } from '@/lib/supabaseClient';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Thread list: pinned first, then most recent activity.
export async function GET() {
  const r = await requireMemberCtx();
  if ('res' in r) return r.res;
  const { ctx } = r;
  const sb = getSupabase();
  const [{ data: threads }, { data: posts }, people] = await Promise.all([
    sb.from('threads').select('*').eq('dynasty_id', ctx.dynastyId),
    sb.from('posts').select('thread_id, created_at').eq('dynasty_id', ctx.dynastyId),
    peopleOf(ctx, true),
  ]);
  const nameBy = new Map(people.map((p) => [p.userId, p.name]));
  const stats = new Map<string, { count: number; last: string }>();
  (posts || []).forEach((p: any) => {
    const s = stats.get(p.thread_id) || { count: 0, last: p.created_at };
    s.count++; if (p.created_at > s.last) s.last = p.created_at; stats.set(p.thread_id, s);
  });
  const out = (threads || []).map((t: any) => ({
    id: t.id, title: t.title, kind: t.kind, pinned: t.pinned, createdAt: t.created_at,
    author: t.created_by ? nameBy.get(t.created_by) || 'Coach' : 'Dynasty HQ',
    posts: stats.get(t.id)?.count || 0, lastActivity: stats.get(t.id)?.last || t.created_at,
  })).sort((a: any, b: any) => Number(b.pinned) - Number(a.pinned) || b.lastActivity.localeCompare(a.lastActivity));
  return NextResponse.json({ isCommish: ctx.isCommish, threads: out });
}

// New thread with its first post. Announcements: commissioner only.
export async function POST(req: NextRequest) {
  const r = await requireMemberCtx();
  if ('res' in r) return r.res;
  const { ctx } = r;
  const b = await req.json().catch(() => ({}));
  const title = String(b.title || '').trim().slice(0, 120);
  const body = String(b.body || '').trim().slice(0, 4000);
  const kind = b.kind === 'announcement' ? 'announcement' : 'general';
  if (title.length < 2) return NextResponse.json({ error: 'Give the thread a title.' }, { status: 400 });
  if (!body) return NextResponse.json({ error: 'Write something first.' }, { status: 400 });
  if (kind === 'announcement' && !ctx.isCommish) return NextResponse.json({ error: 'Only the commissioner can post announcements.' }, { status: 403 });

  const sb = getSupabase();
  const { data: t, error } = await sb.from('threads').insert({ dynasty_id: ctx.dynastyId, kind, title, created_by: ctx.userId, pinned: kind === 'announcement' }).select('id').single();
  if (error || !t) return NextResponse.json({ error: error?.message || 'Could not create the thread.' }, { status: 500 });
  await sb.from('posts').insert({ dynasty_id: ctx.dynastyId, thread_id: t.id, author_id: ctx.userId, body });
  return NextResponse.json({ id: t.id });
}
