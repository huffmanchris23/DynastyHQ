import { NextResponse } from 'next/server';
import { requireMemberCtx, peopleOf } from '@/lib/community';
import { openWeekOf } from '@/lib/ocrShared';
import { getSupabase } from '@/lib/supabaseClient';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const REQUIRED = [
  { screen: 'team_schedule', min: 2, label: 'Team schedule (2 screens)' },
  { screen: 'stats_offense', min: 1, label: 'Offense stats' },
  { screen: 'stats_defense', min: 1, label: 'Defense stats' },
  { screen: 'conference_standings', min: 1, label: 'Conference standings' },
];

// Everyone in the dynasty: team, coach, role, and (while a week is open) ready / not ready.
export async function GET() {
  const r = await requireMemberCtx();
  if ('res' in r) return r.res;
  const { ctx } = r;
  const sb = getSupabase();

  const people = await peopleOf(ctx);
  const open = openWeekOf(ctx);

  const ready = new Map<string, { ready: boolean; missing: string[] }>();
  if (open !== null) {
    const { data: logs } = await sb.from('ocr_audit_log').select('uploaded_by, screen_type, file_path, status, id')
      .eq('dynasty_id', ctx.dynastyId).eq('season', ctx.season).eq('week', open).order('id', { ascending: true });
    const latest = new Map<string, any>();
    (logs || []).forEach((l: any) => { if (l.file_path !== '(engine)') latest.set(`${l.uploaded_by}|${l.file_path}`, l); });
    people.forEach((p) => {
      const mine = Array.from(latest.values()).filter((l: any) => l.uploaded_by === p.userId && l.status === 'success');
      const missing = REQUIRED.filter((q) => mine.filter((l: any) => l.screen_type === q.screen).length < q.min).map((q) => q.label);
      ready.set(p.userId, { ready: missing.length === 0, missing });
    });
  }

  const { data: d } = await sb.from('dynasties').select('claims_open').eq('id', ctx.dynastyId).single();

  return NextResponse.json({
    me: ctx.userId,
    isCommish: ctx.isCommish,
    openWeek: open,
    liveWeek: ctx.liveWeek,
    claimsOpen: d?.claims_open ?? true,
    members: people
      .map((p) => ({
        ...p,
        ready: open !== null && p.team ? ready.get(p.userId)?.ready ?? false : null,
        missing: open !== null && p.team && ctx.isCommish ? ready.get(p.userId)?.missing ?? [] : [],
      }))
      .sort((a, b) => (a.role === 'member' ? 1 : 0) - (b.role === 'member' ? 1 : 0) || (a.team || 'zzz').localeCompare(b.team || 'zzz')),
  });
}
