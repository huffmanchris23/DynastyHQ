import { NextRequest, NextResponse } from 'next/server';
import { getUser, unauthorized, fail } from '@/lib/auth';
import { isAppOwner } from '@/lib/owner';
import { getSupabase } from '@/lib/supabaseClient';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const STATUSES = ['open', 'planned', 'done', 'closed'];

// Owner only: every bug report and feature request, newest first.
export async function GET() {
  const user = await getUser();
  if (!user) return unauthorized();
  if (!(await isAppOwner(user.id))) return fail(403, 'Owner only.');

  const sb = getSupabase();
  const { data, error } = await sb.from('reports').select('id, kind, user_id, dynasty_id, title, body, status, created_at').order('created_at', { ascending: false }).limit(200);
  if (error) return fail(500, error.message);
  const rows = data || [];

  const dynastyIds = Array.from(new Set(rows.map((r: any) => r.dynasty_id).filter(Boolean)));
  const userIds = Array.from(new Set(rows.map((r: any) => r.user_id).filter(Boolean)));

  const dynastyNames = new Map<string, string>();
  if (dynastyIds.length) {
    const { data: ds } = await sb.from('dynasties').select('id, name').in('id', dynastyIds);
    (ds || []).forEach((d: any) => dynastyNames.set(d.id, d.name));
  }
  const people = new Map<string, { name: string; email: string }>();
  await Promise.all(userIds.map(async (id: string) => {
    try {
      const { data: u } = await sb.auth.admin.getUserById(id);
      const meta: any = u?.user?.user_metadata || {};
      people.set(id, { name: String(meta.full_name || meta.name || '').slice(0, 60), email: u?.user?.email || '' });
    } catch { /* unknown reporter */ }
  }));

  return NextResponse.json({
    reports: rows.map((r: any) => ({
      id: r.id, kind: r.kind, title: r.title, body: r.body, status: r.status, createdAt: r.created_at,
      dynasty: r.dynasty_id ? dynastyNames.get(r.dynasty_id) || null : null,
      reporter: r.user_id ? people.get(r.user_id) || null : null,
    })),
  });
}

// Owner only: { id, status } where status is open | planned | done | closed.
export async function PATCH(req: NextRequest) {
  const user = await getUser();
  if (!user) return unauthorized();
  if (!(await isAppOwner(user.id))) return fail(403, 'Owner only.');
  const b = await req.json().catch(() => ({}));
  const id = String(b.id || '');
  const status = String(b.status || '');
  if (!id) return fail(400, 'Missing report.');
  if (!STATUSES.includes(status)) return fail(400, 'Unknown status.');
  const { error } = await getSupabase().from('reports').update({ status }).eq('id', id);
  if (error) return fail(500, error.message);
  return NextResponse.json({ ok: true });
}
