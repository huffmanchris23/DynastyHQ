/**
 * Web push to phones (free, no third-party service). Needs two Vercel env vars:
 * NEXT_PUBLIC_VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY. Without them every call is a
 * quiet no-op, so the app behaves exactly as before until the keys are added.
 */
import webpush from 'web-push';
import { getSupabase } from './supabaseClient';

export interface PushPayload { title: string; body?: string | null; nav?: { tab: string; subtab?: string } | null; tag?: string }

export const pushEnabled = () => !!(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);

let configured = false;
function configure() {
  if (configured) return true;
  if (!pushEnabled()) return false;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:support@dynastyhq.app', process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY as string, process.env.VAPID_PRIVATE_KEY as string);
  configured = true;
  return true;
}

/** Sends to every registered device of the given users. Never throws; dead devices are removed. */
export async function sendPush(userIds: string[], p: PushPayload) {
  try {
    if (!userIds.length || !configure()) return;
    const sb = getSupabase();
    const { data } = await sb.from('push_subscriptions').select('id, endpoint, p256dh, auth').in('user_id', userIds);
    const body = JSON.stringify({ title: p.title, body: p.body || '', nav: p.nav || null, tag: p.tag });
    const dead: string[] = [];
    await Promise.allSettled(
      (data || []).map(async (s: any) => {
        try {
          await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body, { TTL: 60 * 60 * 24 });
        } catch (e: any) {
          if (e?.statusCode === 404 || e?.statusCode === 410) dead.push(s.id);
        }
      })
    );
    if (dead.length) await sb.from('push_subscriptions').delete().in('id', dead);
  } catch { /* push is best-effort */ }
}
