/** Browser-side helpers for phone alerts (used by the opt-in card and the bell menu). */
export type PushState = 'unsupported' | 'unavailable' | 'blocked' | 'off' | 'on';

function b64ToUint8(b64: string) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(Array.from(raw).map((c) => c.charCodeAt(0)));
}

export function pushSupported() {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

/** unsupported = this browser can't (e.g. iPhone Safari tab); unavailable = server keys not set; blocked = denied in phone settings. */
export async function pushState(): Promise<PushState> {
  if (!pushSupported()) return 'unsupported';
  try {
    const cfg = await fetch('/api/push').then((r) => r.json());
    if (!cfg?.enabled) return 'unavailable';
    if (Notification.permission === 'denied') return 'blocked';
    const reg = await navigator.serviceWorker.register('/sw.js');
    const sub = await reg.pushManager.getSubscription();
    return Notification.permission === 'granted' && sub ? 'on' : 'off';
  } catch { return 'unavailable'; }
}

export async function enablePush(): Promise<PushState> {
  try {
    const cfg = await fetch('/api/push').then((r) => r.json());
    if (!cfg?.enabled || !cfg.publicKey) return 'unavailable';
    const perm = await Notification.requestPermission();
    if (perm === 'denied') return 'blocked';
    if (perm !== 'granted') return 'off';
    await navigator.serviceWorker.register('/sw.js');
    const reg = await navigator.serviceWorker.ready;
    const sub = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToUint8(cfg.publicKey) }));
    await fetch('/api/push', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subscription: sub.toJSON() }) });
    return 'on';
  } catch { return 'off'; }
}

export async function disablePush(): Promise<PushState> {
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      await fetch('/api/push', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ endpoint: sub.endpoint }) });
      await sub.unsubscribe();
    }
  } catch { /* ignore */ }
  return 'off';
}
