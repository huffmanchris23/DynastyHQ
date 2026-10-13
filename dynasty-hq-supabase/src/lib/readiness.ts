import { getSupabase } from './supabaseClient';
import { requiredForWeek } from './ocrShared';

// What a member must have processed for the open week comes from requiredForWeek()
// (ocrShared.ts): no team stats in Week 0, one offense + one defense from Week 1 on.
export async function readiness(dynastyId: string, season: number, week: number) {
  const sb = getSupabase();
  const REQUIRED = requiredForWeek(week);
  const [{ data: members }, { data: logs }, { data: coaches }] = await Promise.all([
    sb.from('dynasty_members').select('user_id, team, role, status').eq('dynasty_id', dynastyId).eq('status', 'active'),
    sb.from('ocr_audit_log').select('uploaded_by, screen_type, file_path, status, id').eq('dynasty_id', dynastyId).eq('season', season).eq('week', week).order('id', { ascending: true }),
    sb.from('my_coach').select('user_id, name').eq('dynasty_id', dynastyId).eq('season', season),
  ]);
  // Always the coach's in-game name, never the name on their Google account.
  const coachName = new Map<string, string>((coaches || []).filter((c: any) => c.name).map((c: any) => [c.user_id, c.name]));

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
      return { userId: m.user_id, team: m.team, name: coachName.get(m.user_id) || '', role: m.role, ready: missing.length === 0, missing };
    });
}
