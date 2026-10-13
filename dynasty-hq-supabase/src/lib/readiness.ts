import { getSupabase } from './supabaseClient';
import { requiredForWeek } from './ocrShared';

// What a member must have processed for the open week comes from requiredForWeek()
// (ocrShared.ts): no team stats in Week 0, one offense + one defense from Week 1 on.
export async function readiness(dynastyId: string, season: number, week: number) {
  const sb = getSupabase();
  const REQUIRED = requiredForWeek(week);
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
