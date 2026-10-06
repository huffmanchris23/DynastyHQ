/**
 * Week lifecycle for a dynasty (kept at this path so the old route file is
 * replaced rather than orphaned).
 *   GET  -> where the dynasty is: live week, open (staged) week, countdown, and
 *           each member's ready / not-ready status for the open week.
 *   POST { action: 'open', week? }     commish starts the next upload cycle
 *   POST { action: 'advance', force? } commish takes the staged week LIVE for everyone
 */
import { NextRequest, NextResponse } from 'next/server';
import { getUser, unauthorized } from '@/lib/auth';
import { getSupabase } from '@/lib/supabaseClient';
import { getDynastyCtx } from '@/lib/dynastyContext';
import { openWeekOf } from '@/lib/ocrShared';
import { MIN_WEEK, MAX_WEEK, weekLabel } from '@/lib/weeks';
import { syncUserGames } from '@/lib/community';
import { memberIds, notify } from '@/lib/notify';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

// What a member must have processed for the open week. stats _2 screens are optional.
const REQUIRED: { screen: string; min: number; label: string }[] = [
  { screen: 'team_schedule', min: 2, label: 'Team schedule (2 screens)' },
  { screen: 'stats_offense', min: 1, label: 'Offense stats' },
  { screen: 'stats_defense', min: 1, label: 'Defense stats' },
  { screen: 'conference_standings', min: 1, label: 'Conference standings' },
];

async function readiness(dynastyId: string, season: number, week: number) {
  const sb = getSupabase();
  const [{ data: members }, { data: logs }] = await Promise.all([
    sb.from('dynasty_members').select('user_id, team, role, status, profiles(display_name)').eq('dynasty_id', dynastyId).eq('status', 'active'),
    sb.from('ocr_audit_log').select('uploaded_by, screen_type, file_path, status, id').eq('dynasty_id', dynastyId).eq('season', season).eq('week', week).order('id', { ascending: true }),
  ]);

  // latest status per (uploader, file) wins — a later failed re-run counts against an earlier success
  const latest = new Map<string, any>();
  (logs || []).forEach((r: any) => {
    if (r.file_path === '(engine)') return;
    latest.set(`${r.uploaded_by}|${r.file_path}`, r);
  });

  return (members || [])
    .filter((m: any) => m.team)
    .map((m: any) => {
      const mine = Array.from(latest.values()).filter((r: any) => r.uploaded_by === m.user_id && r.status === 'success');
      const missing = REQUIRED.filter((req) => mine.filter((r: any) => r.screen_type === req.screen).length < req.min).map((r) => r.label);
      const prof = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles;
      return { userId: m.user_id, team: m.team, name: prof?.display_name || '', role: m.role, ready: missing.length === 0, missing };
    });
}

export async function GET() {
  const user = await getUser();
  if (!user) return unauthorized();
  const c = await getDynastyCtx(user.id);
  if (!c) return NextResponse.json({ error: 'Join a dynasty first.' }, { status: 409 });

  const sb = getSupabase();
  const { data: d } = await sb.from('dynasties').select('countdown_ends_at, week_length_hours').eq('id', c.dynastyId).single();
  const open = openWeekOf(c);
  const members = open === null ? [] : await readiness(c.dynastyId, c.season, open);

  return NextResponse.json({
    isCommish: c.isCommish,
    season: c.season,
    liveWeek: c.liveWeek,
    openWeek: open,
    countdownEndsAt: d?.countdown_ends_at ?? null,
    weekLengthHours: d?.week_length_hours ?? null,
    members,
  });
}

export async function POST(req: NextRequest) {
  const user = await getUser();
  if (!user) return unauthorized();
  const c = await getDynastyCtx(user.id);
  if (!c) return NextResponse.json({ error: 'Join a dynasty first.' }, { status: 409 });
  if (!c.isCommish) return NextResponse.json({ error: 'Only the commissioner can do that.' }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const sb = getSupabase();
  const open = openWeekOf(c);

  if (body.action === 'open') {
    if (open !== null) return NextResponse.json({ error: `Week ${open} is already open.` }, { status: 409 });
    const target = body.week !== undefined && body.week !== null && body.week !== '' ? Number(body.week) : c.liveWeek !== null ? c.liveWeek + 1 : NaN;
    if (!Number.isInteger(target) || target < MIN_WEEK || target > MAX_WEEK) return NextResponse.json({ error: 'Pick a week from 0 to 19.' }, { status: 400 });
    if (c.liveWeek !== null && target <= c.liveWeek) return NextResponse.json({ error: `Week ${target} is already live.` }, { status: 409 });
    const { error } = await sb.from('dynasties').update({ staged_week: target, countdown_ends_at: null }).eq('id', c.dynastyId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ openWeek: target });
  }

  if (body.action === 'advance') {
    if (open === null) return NextResponse.json({ error: 'No week is open to publish.' }, { status: 409 });
    const members = await readiness(c.dynastyId, c.season, open);
    const notReady = members.filter((m) => !m.ready);
    if (notReady.length && !body.force) {
      return NextResponse.json({ error: 'Some members are not ready.', notReady }, { status: 409 });
    }
    const { data: d } = await sb.from('dynasties').select('week_length_hours').eq('id', c.dynastyId).single();
    const ends = d?.week_length_hours ? new Date(Date.now() + d.week_length_hours * 3600_000).toISOString() : null;
    const { error } = await sb.from('dynasties').update({ live_week: open, staged_week: open, countdown_ends_at: ends }).eq('id', c.dynastyId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await notify(await memberIds(c.dynastyId), { dynastyId: c.dynastyId, type: 'week_live', title: `${weekLabel(open)} is live`, body: ends ? 'The countdown to advance has started.' : undefined, nav: { tab: 'home' } });
    // Coach-vs-coach games get their message-board thread as soon as the week goes live.
    try { await syncUserGames({ ...c, liveWeek: open, stagedWeek: open }, open); } catch { /* the Scheduling Assistant retries on first view */ }
    return NextResponse.json({ liveWeek: open, countdownEndsAt: ends });
  }

  return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
}
