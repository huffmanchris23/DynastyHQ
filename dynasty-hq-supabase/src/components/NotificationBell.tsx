'use client';

import { useCallback, useEffect, useState } from 'react';

interface Item { id: string; type: string; title: string; body: string | null; data: any; read_at: string | null; created_at: string }

function ago(iso: string): string {
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

/** Header bell: unread count (polled once a minute and on return to the app), tap for the list. */
export default function NotificationBell() {
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Item[] | null>(null);

  const refreshCount = useCallback(() => {
    fetch('/api/notifications?count=1').then((r) => r.json()).then((b) => typeof b.unread === 'number' && setUnread(b.unread)).catch(() => {});
  }, []);

  useEffect(() => {
    refreshCount();
    const t = setInterval(refreshCount, 60000);
    const vis = () => { if (document.visibilityState === 'visible') refreshCount(); };
    document.addEventListener('visibilitychange', vis);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', vis); };
  }, [refreshCount]);

  async function openSheet() {
    setOpen(true);
    const b = await fetch('/api/notifications').then((r) => r.json()).catch(() => null);
    if (b) { setItems(b.items || []); setUnread(b.unread || 0); }
  }

  async function tap(n: Item) {
    if (!n.read_at) fetch('/api/notifications', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'read', id: n.id }) }).then(refreshCount);
    setOpen(false);
    const nav = n.data?.nav;
    if (nav?.tab) window.dispatchEvent(new CustomEvent('dhq-nav', { detail: nav }));
  }

  async function readAll() {
    await fetch('/api/notifications', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'read_all' }) });
    setItems((cur) => (cur || []).map((i) => ({ ...i, read_at: i.read_at || new Date().toISOString() })));
    setUnread(0);
  }

  return (
    <>
      <button type="button" className="bell-btn" onClick={openSheet} aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" />
        </svg>
        {unread > 0 ? <span className="bell-badge">{unread > 9 ? '9+' : unread}</span> : null}
      </button>
      {open ? (
        <div className="gate-overlay" onClick={() => setOpen(false)}>
          <div className="gate-sheet" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3>Notifications</h3>
              {unread > 0 ? <button className="gate-link" onClick={readAll}>Mark all read</button> : null}
            </div>
            {items === null ? <div className="gate-hint">Loading…</div> : null}
            {items && items.length === 0 ? <div className="gate-hint">Nothing yet. You will see week updates, games, and league news here.</div> : null}
            {(items || []).map((n) => (
              <button key={n.id} type="button" className={`gate-team ${n.read_at ? '' : 'sel'}`} onClick={() => tap(n)} style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
                <span className="nm" style={{ fontWeight: n.read_at ? 500 : 700 }}>{n.title}</span>
                {n.body ? <span className="meta" style={{ whiteSpace: 'normal' }}>{n.body}</span> : null}
                <span className="meta">{ago(n.created_at)}</span>
              </button>
            ))}
            <button className="gate-link" onClick={() => setOpen(false)}>Close</button>
          </div>
        </div>
      ) : null}
    </>
  );
}
