'use client';

import { useEffect, useState } from 'react';

function b64ToUint8(b64: string) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(Array.from(raw).map((c) => c.charCodeAt(0)));
}

const DISMISS_KEY = 'dhq-push-dismissed';

/**
 * Registers the service worker (so a tapped phone notification opens the right tab),
 * quietly re-saves this device if it already allowed notifications, and shows a
 * one-tap "turn on notifications" card where phones can actually receive them:
 * the installed home-screen app, or any Android browser. Hidden until the server has push keys.
 */
export default function PushPrompt() {
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [key, setKey] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return;
    let cancelled = false;
    const onMsg = (e: MessageEvent) => { if (e.data?.type === 'dhq-nav' && e.data.nav?.tab) window.dispatchEvent(new CustomEvent('dhq-nav', { detail: e.data.nav })); };
    navigator.serviceWorker.addEventListener('message', onMsg);

    (async () => {
      try {
        const cfg = await fetch('/api/push').then((r) => r.json());
        if (!cfg?.enabled || !cfg.publicKey || cancelled) return;
        const reg = await navigator.serviceWorker.register('/sw.js');
        setKey(cfg.publicKey);
        if (Notification.permission === 'granted') {
          const existing = await reg.pushManager.getSubscription();
          if (existing) await fetch('/api/push', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subscription: existing.toJSON() }) });
          return;
        }
        if (Notification.permission === 'denied') return;
        let dismissed = false;
        try { dismissed = localStorage.getItem(DISMISS_KEY) === '1'; } catch { /* storage unavailable */ }
        if (!dismissed) setShow(true);
      } catch { /* push is optional */ }
    })();
    return () => { cancelled = true; navigator.serviceWorker.removeEventListener('message', onMsg); };
  }, []);

  async function enable() {
    if (!key) return;
    setBusy(true);
    try {
      const perm = await Notification.requestPermission();
      if (perm === 'granted') {
        const reg = await navigator.serviceWorker.ready;
        const sub = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToUint8(key) }));
        await fetch('/api/push', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subscription: sub.toJSON() }) });
      }
      setShow(false);
    } catch { setShow(false); }
    setBusy(false);
  }

  function dismiss() {
    try { localStorage.setItem(DISMISS_KEY, '1'); } catch { /* ignore */ }
    setShow(false);
  }

  if (!show) return null;
  return (
    <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '0 0 12px' }}>
      <div style={{ flex: 1, minWidth: 0, fontSize: 13, lineHeight: 1.35 }}>
        <strong>Get alerts on your phone.</strong> Week goes live, your game, and league news.
      </div>
      <button type="button" className="gate-chip" onClick={enable} disabled={busy}>{busy ? '…' : 'Turn on'}</button>
      <button type="button" className="gate-link" onClick={dismiss} aria-label="Not now">Not now</button>
    </div>
  );
}
