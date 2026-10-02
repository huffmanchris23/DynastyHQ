/**
 * Builds a team's game_preview rows (one per game) from its processed
 * team_schedule rows — nobody seeds these by hand anymore. Only the 
 * identity fields (team, opponent, home_team, week, week_name) are written
 * here; odds, broadcast, and ratings columns are filled by the engines and
 * are never overwritten once present. Safe to call repeatedly.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export async function syncGamePreviewFromSchedule(
  sb: SupabaseClient,
  p: { dynastyId: string; userId: string | null; team: string; season: number }
): Promise<{ inserted: number; updated: number }> {
  const [{ data: sched, error: sErr }, { data: existing, error: eErr }] = await Promise.all([
    sb.from('team_schedule').select('week, week_name, opponent, home_or_away, game_day, game_date, game_time, w_or_l').eq('dynasty_id', p.dynastyId).eq('season', p.season).eq('team', p.team),
    sb.from('game_preview').select('id, week, opponent, home_team, week_name, game_day, game_date, game_time').eq('dynasty_id', p.dynastyId).eq('season', p.season).eq('team', p.team),
  ]);
  if (sErr) throw new Error(`team_schedule: ${sErr.message}`);
  if (eErr) throw new Error(`game_preview: ${eErr.message}`);

  const byWeek = new Map<number, any>();
  (existing || []).forEach((r: any) => byWeek.set(r.week, r));

  let inserted = 0;
  let updated = 0;
  for (const row of sched || []) {
    const opp = String(row.opponent || '').trim();
    if (!opp || opp.toLowerCase() === 'bye') continue; // byes have no game to preview
    const ha = String(row.home_or_away || '').trim().toUpperCase();
    const homeTeam = ha === 'HOME' ? p.team : ha === 'AWAY' ? opp : p.team; // neutral/unknown: treat as the team's own game
    // Kickoff info comes straight off the schedule screen. Once a game is played
    // the screen swaps the time for the result, so a missing time never erases one
    // already stored.
    const fields: Record<string, any> = { opponent: opp, home_team: homeTeam, week_name: row.week_name };
    if (row.game_day) fields.game_day = row.game_day;
    if (row.game_date) fields.game_date = row.game_date;
    if (row.game_time) fields.game_time = row.game_time;

    const cur = byWeek.get(row.week);
    if (!cur) {
      const { error } = await sb.from('game_preview').insert({
        dynasty_id: p.dynastyId, user_id: p.userId, season: p.season, team: p.team, week: row.week, ...fields,
      });
      if (error) throw new Error(`game_preview insert (week ${row.week}): ${error.message}`);
      inserted++;
    } else if (Object.keys(fields).some((k) => (cur as any)[k] !== fields[k])) {
      const { error } = await sb.from('game_preview').update(fields).eq('id', cur.id);
      if (error) throw new Error(`game_preview update (week ${row.week}): ${error.message}`);
      updated++;
    }
  }
  return { inserted, updated };
}
