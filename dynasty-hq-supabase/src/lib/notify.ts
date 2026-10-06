/**
 * In-app notifications (the bell). One row per recipient in `notifications`.
 * `data.nav` tells the app where to take someone when they tap it.
 * Failures never block the action that triggered them.
 */
import { getSupabase } from './supabaseClient';

export interface NotifyPayload {
  dynastyId: string;
  type: string;
  title: string;
  body?: string;
  nav?: { tab: string; subtab?: string };
}

export async function notify(userIds: (string | null | undefined)[], p: NotifyPayload) {
  const ids = Array.from(new Set(userIds.filter((u): u is string => !!u)));
  if (!ids.length) return;
  try {
    await getSupabase().from('notifications').insert(
      ids.map((user_id) => ({
        user_id, dynasty_id: p.dynastyId, type: p.type, title: p.title.slice(0, 140), body: p.body ? p.body.slice(0, 400) : null,
        data: p.nav ? { nav: p.nav } : {},
      }))
    );
  } catch { /* notifications are best-effort */ }
}

/** Active commissioner(s) of a dynasty. */
export async function commishIds(dynastyId: string): Promise<string[]> {
  const { data } = await getSupabase().from('dynasty_members').select('user_id').eq('dynasty_id', dynastyId).in('role', ['commish', 'co_commish']).eq('status', 'active');
  return (data || []).map((r: any) => r.user_id);
}

/** Everyone active in a dynasty. */
export async function memberIds(dynastyId: string): Promise<string[]> {
  const { data } = await getSupabase().from('dynasty_members').select('user_id').eq('dynasty_id', dynastyId).neq('status', 'removed');
  return (data || []).map((r: any) => r.user_id);
}
