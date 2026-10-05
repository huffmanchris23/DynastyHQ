import { NextRequest, NextResponse } from 'next/server';
import { requireMemberCtx, peopleOf } from '@/lib/community';
import { getSupabase } from '@/lib/supabaseClient';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function loadThread(dynastyId: string, id: string) {
  const { data } = await getSupabase().from('threads').select('*').eq('id', id).eq('dynasty_id', dynastyId).maybeSingle();
  return data as any | null;
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const r = await requireMemberCtx();
  if ('res' in r) return r.res;
  const { ctx } = r;
  const t = await loadThread(ctx.dynastyId, params.id);
  if (!t) return NextResponse.json({ error: 'Thread not found.' }, { status: 404 });
  const [{ data: posts }, people] = await Promise.all([
    getSupabase().from('posts').select('*').eq('thread_id', t.id).order('created_at', { ascending: true }),
    peopleOf(ctx, true),
  ]);
  const by = new Map(people.map((p) => [p.userId, p]));
  return NextResponse.json({
    me: ctx.userId, isCommish: ctx.isCommish,
    thread: { id: t.id, title: t.title, kind: t.kind, pinned: t.pinned },
    posts: (posts || []).map((p: any) => ({
      id: p.id, body: p.body, createdAt: p.created_at, mine: p.author_id === ctx.userId,
      author: p.author_id ? by.get(p.author_id)?.name || 'Coach' : 'Dynasty HQ',
      team: p.author_id ? by.get(p.author_id)?.team || null : null,
      logo: p.author_id ? by.get(p.author_id)?.logo || null : null,
      system: !p.author_id,
    })),
  });
}

// { action: 'reply', body } | { action: 'delete_post', postId } | { action: 'pin', pinned } (commish) | { action: 'delete_thread' } (commish)
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const r = await requireMemberCtx();
  if ('res' in r) return r.res;
  const { ctx } = r;
  const t = await loadThread(ctx.dynastyId, params.id);
  if (!t) return NextResponse.json({ error: 'Thread not found.' }, { status: 404 });
  const sb = getSupabase();
  const b = await req.json().catch(() => ({}));

  if (b.action === 'reply') {
    const body = String(b.body || '').trim().slice(0, 4000);
    if (!body) return NextResponse.json({ error: 'Write something first.' }, { status: 400 });
    const { error } = await sb.from('posts').insert({ dynasty_id: ctx.dynastyId, thread_id: t.id, author_id: ctx.userId, body });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }
  if (b.action === 'delete_post') {
    const { data: p } = await sb.from('posts').select('id, author_id').eq('id', b.postId).eq('thread_id', t.id).maybeSingle();
    if (!p) return NextResponse.json({ error: 'Post not found.' }, { status: 404 });
    if (p.author_id !== ctx.userId && !ctx.isCommish) return NextResponse.json({ error: 'You can only delete your own posts.' }, { status: 403 });
    await sb.from('posts').delete().eq('id', p.id);
    return NextResponse.json({ ok: true });
  }
  if (!ctx.isCommish) return NextResponse.json({ error: 'Only the commissioner can do that.' }, { status: 403 });
  if (b.action === 'pin') {
    await sb.from('threads').update({ pinned: !!b.pinned }).eq('id', t.id);
    return NextResponse.json({ ok: true });
  }
  if (b.action === 'delete_thread') {
    if (t.kind === 'user_game') return NextResponse.json({ error: 'Game threads are managed automatically.' }, { status: 400 });
    await sb.from('threads').delete().eq('id', t.id);
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
}
