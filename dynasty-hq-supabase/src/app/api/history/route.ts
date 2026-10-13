/**
 * Dynasty history.
 *   GET  -> everything members can browse: coach-vs-coach head-to-head records,
 *           season champions, and season awards. ?season=N adds the saved entry
 *           for that season (used to pre-fill the commissioner's form).
 *   POST -> commissioner saves one season's champion + awards.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireMemberCtx, peopleOf } from '@/lib/community';
import { getSupabase } from '@/lib/supabaseClient';
import { notify, memberIds } from '@/lib/notify';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DECIDED = ['played', 'simmed', 'forfeit'];

export async function GET(req: NextRequest) {
  const r = await requireMemberCtx();
  if ('res' in r) return r.res;
  const { ctx } = r;
  const sb = getSupabase();
  const people = await peopleOf(ctx, true);
  const byId = new Map(people.map((p) => [p.userId, p]));

  const [{ data: games }, { data: seasons }, { data: awards }] = await Promise.all([
    sb.from('user_games').select('season, week, team_a, team_b, user_a, user_b, winner, winner_user, status').eq('dynasty_id', ctx.dynastyId).in('status', DECIDED).not('winner_user', 'is', null).order('season', { ascending: true }).order('week', { ascending: true }),
    sb.from('season_history').select('*').eq('dynasty_id', ctx.dynastyId).order('season', { ascending: false }),
    sb.from('season_awards').select('*').eq('dynasty_id', ctx.dynastyId).order('season', { ascending: false }).order('sort', { ascending: true }),
  ]);

  // Head-to-head: one record per pair of coaches, counting played, simmed and forced wins alike.
  const pairs = new Map<string, any>();
  (games || []).forEach((g: any) => {
    if (!g.user_a || !g.user_b) return;
    const [a, b] = [g.user_a, g.user_b].sort();
    const key = `${a}|${b}`;
    if (!pairs.has(key)) pairs.set(key, { aId: a, bId: b, aWins: 0, bWins: 0, games: [] });
    const p = pairs.get(key);
    if (g.winner_user === a) p.aWins += 1; else if (g.winner_user === b) p.bWins += 1;
    p.games.push({ season: g.season, week: g.week, winnerId: g.winner_user, winnerTeam: g.winner, teamA: g.team_a, teamB: g.team_b, status: g.status });
  });
  const h2h = Array.from(pairs.values()).map((p: any) => {
    const last = p.games[p.games.length - 1];
    let streak = 0;
    for (let i = p.games.length - 1; i >= 0 && p.games[i].winnerId === last.winnerId; i--) streak++;
    const who = (id: string) => byId.get(id);
    return {
      aId: p.aId, bId: p.bId,
      aName: who(p.aId)?.name || 'Coach', bName: who(p.bId)?.name || 'Coach',
      aTeam: who(p.aId)?.team || null, bTeam: who(p.bId)?.team || null,
      aLogo: who(p.aId)?.logo || null, bLogo: who(p.bId)?.logo || null,
      aWins: p.aWins, bWins: p.bWins,
      streak: { userId: last.winnerId, count: streak },
      games: p.games.slice().reverse(),
    };
  }).sort((x: any, y: any) => (y.aWins + y.bWins) - (x.aWins + x.bWins));

  // Each coach's overall coach-vs-coach record.
  const overall = new Map<string, { w: number; l: number }>();
  h2h.forEach((p: any) => {
    const add = (id: string, w: number, l: number) => { const o = overall.get(id) || { w: 0, l: 0 }; o.w += w; o.l += l; overall.set(id, o); };
    add(p.aId, p.aWins, p.bWins); add(p.bId, p.bWins, p.aWins);
  });
  const standings = Array.from(overall.entries()).map(([id, o]) => ({ userId: id, name: byId.get(id)?.name || 'Coach', team: byId.get(id)?.team || null, logo: byId.get(id)?.logo || null, wins: o.w, losses: o.l }))
    .sort((a, b) => (b.wins - b.losses) - (a.wins - a.losses) || b.wins - a.wins);

  const wanted = Number(req.nextUrl.searchParams.get('season'));
  return NextResponse.json({
    me: ctx.userId, isCommish: ctx.isCommish, mode: ctx.mode, currentSeason: ctx.season,
    h2h, standings,
    champions: (seasons || []).map((s: any) => ({ ...s, championCoach: s.champion_user ? byId.get(s.champion_user)?.name || null : null, runnerUpCoach: s.runner_up_user ? byId.get(s.runner_up_user)?.name || null : null })),
    awards: awards || [],
    saved: wanted ? { season: (seasons || []).find((s: any) => s.season === wanted) || null, awards: (awards || []).filter((a: any) => a.season === wanted) } : null,
  });
}

export async function POST(req: NextRequest) {
  const r = await requireMemberCtx();
  if ('res' in r) return r.res;
  const { ctx } = r;
  if (!ctx.isCommish) return NextResponse.json({ error: 'Only the commissioner can save history.' }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const season = Number(b.season);
  if (!Number.isInteger(season) || season < 1 || season > 200) return NextResponse.json({ error: 'Pick a season.' }, { status: 400 });
  const clean = (v: any, n = 120) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, n) : null);
  const championTeam = clean(b.championTeam), runnerUpTeam = clean(b.runnerUpTeam);
  const awards = (Array.isArray(b.awards) ? b.awards : []).slice(0, 20)
    .map((a: any, i: number) => ({ award: clean(a.award, 80), winner_name: clean(a.winnerName), winner_team: clean(a.winnerTeam), detail: clean(a.detail), sort: i }))
    .filter((a: any) => a.award && (a.winner_name || a.winner_team));
  if (!championTeam && !awards.length) return NextResponse.json({ error: 'Add a champion or at least one award.' }, { status: 400 });

  const sb = getSupabase();
  const { data: coaches } = await sb.from('dynasty_members').select('user_id, team').eq('dynasty_id', ctx.dynastyId).neq('status', 'removed');
  const coachOf = (team: string | null) => (team ? (coaches || []).find((m: any) => m.team === team)?.user_id ?? null : null);
  const { data: existing } = await sb.from('season_history').select('id').eq('dynasty_id', ctx.dynastyId).eq('season', season).maybeSingle();

  const row = {
    dynasty_id: ctx.dynastyId, season, champion_team: championTeam, champion_user: coachOf(championTeam),
    runner_up_team: runnerUpTeam, runner_up_user: coachOf(runnerUpTeam), title_score: clean(b.titleScore, 40),
    created_by: ctx.userId, updated_at: new Date().toISOString(),
  };
  const { error } = await sb.from('season_history').upsert(row, { onConflict: 'dynasty_id,season' });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await sb.from('season_awards').delete().eq('dynasty_id', ctx.dynastyId).eq('season', season);
  if (awards.length) {
    const { error: aErr } = await sb.from('season_awards').insert(awards.map((a: any) => ({ ...a, dynasty_id: ctx.dynastyId, season, winner_user: coachOf(a.winner_team) })));
    if (aErr) return NextResponse.json({ error: aErr.message }, { status: 500 });
  }
  if (!existing && championTeam) {
    await notify(await memberIds(ctx.dynastyId), { dynastyId: ctx.dynastyId, type: 'history', title: `Season ${season} champion: ${championTeam}`, nav: { tab: 'history', subtab: 'champs' } });
  }
  return NextResponse.json({ ok: true });
}
