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
import { completeWeekPreviews, type PreviewCompletion } from '@/lib/previewPipeline';
import { notify } from '@/lib/notify';
import { readiness } from '@/lib/readiness';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

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
    // Last chance to guarantee every game preview for this week is complete
    // (rows, odds, win probability, network) before everyone can see it —
    // regardless of the order uploads arrived in. Problems are reported back,
    // never silently dropped, and don't block going live.
    let previews: PreviewCompletion | null = null;
    let previewError: string | null = null;
    try {
      previews = await completeWeekPreviews(sb, { dynastyId: c.dynastyId, season: c.season, week: open });
    } catch (err: any) {
      previewError = err?.message || String(err);
    }
    const previewIssues = previewError ? [previewError] : previews ? previews.issues : [];
    await sb.from('ocr_audit_log').insert({
      dynasty_id: c.dynastyId, uploaded_by: c.userId, team: c.team, season: c.season, week: open,
      screen_type: 'preview_finalize', file_path: '(engine)', status: previewIssues.length ? 'error' : 'success',
      rows_written: previews ? previews.oddsWritten : 0, error_message: previewIssues.length ? previewIssues.join(' | ').slice(0, 4000) : null,
    });

    const { data: d } = await sb.from('dynasties').select('week_length_hours').eq('id', c.dynastyId).single();
    const ends = d?.week_length_hours ? new Date(Date.now() + d.week_length_hours * 3600_000).toISOString() : null;
    const { error } = await sb.from('dynasties').update({ live_week: open, staged_week: open, countdown_ends_at: ends }).eq('id', c.dynastyId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    // Each coach hears who they play this week (from their processed schedule); a bye gets the plain message.
    const [{ data: mems }, { data: gp }] = await Promise.all([
      sb.from('dynasty_members').select('user_id, team').eq('dynasty_id', c.dynastyId).neq('status', 'removed'),
      sb.from('game_preview').select('team, opponent').eq('dynasty_id', c.dynastyId).eq('season', c.season).eq('week', open),
    ]);
    const oppByTeam = new Map<string, string>();
    (gp || []).forEach((g: any) => { if (g.team && g.opponent) oppByTeam.set(String(g.team).toLowerCase(), g.opponent); });
    await Promise.all(
      (mems || []).map((m: any) => {
        const opp = m.team ? oppByTeam.get(String(m.team).toLowerCase()) : undefined;
        const body = opp ? `You play ${opp} this week.${ends ? ' The countdown to advance has started.' : ''}` : ends ? 'The countdown to advance has started.' : undefined;
        return notify([m.user_id], { dynastyId: c.dynastyId, type: 'week_live', title: `${weekLabel(open)} is live`, body, nav: { tab: 'home' } });
      })
    );
    // Coach-vs-coach games get their message-board thread as soon as the week goes live.
    try { await syncUserGames({ ...c, liveWeek: open, stagedWeek: open }, open); } catch { /* the Scheduling Assistant retries on first view */ }
    return NextResponse.json({ liveWeek: open, countdownEndsAt: ends, previewIssues });
  }

  return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
}
