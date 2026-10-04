'use client';

import { useEffect, useState } from 'react';
import { getBrowserSupabase } from '@/lib/supabase/client';
import Onboarding from './Onboarding';
import CoachSetup from './CoachSetup';

interface Membership { dynastyId: string; role: string; team: string | null; dynasty: { name: string; mode: string } }

// Header control: switch dynasty, add/join another, invite people (commish), sign out.
export default function DynastySwitcher() {
  const [open, setOpen] = useState(false);
  const [me, setMe] = useState<{ memberships: Membership[]; active: (Membership & { dynastyId: string }) | null } | null>(null);
  const [adding, setAdding] = useState(false);
  const [editingCoach, setEditingCoach] = useState(false);
  const [invite, setInvite] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => { fetch('/api/me').then((r) => r.json()).then(setMe).catch(() => {}); }, []);
  if (!me || !me.active) return null;
  const a = me.active;
  const isCommish = a.role === 'commish' || a.role === 'co_commish';

  async function switchTo(id: string) {
    await fetch('/api/dynasties/active', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dynastyId: id }) });
    window.location.reload();
  }
  async function makeInvite() {
    setErr(null);
    const res = await fetch(`/api/dynasties/${a.dynastyId}/invites`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expiresInDays: 14 }) });
    const b = await res.json().catch(() => ({}));
    if (!res.ok) return setErr(b.error || 'Could not create an invite.');
    setInvite(`${window.location.origin}/join/${b.code}`);
  }
  async function signOut() {
    await getBrowserSupabase().auth.signOut();
    window.location.replace('/login');
  }

  if (editingCoach) return <div className="gate-overlay"><CoachSetup onCancel={() => setEditingCoach(false)} onDone={() => window.location.reload()} /></div>;

  if (adding) return <div className="gate-overlay"><Onboarding canCancel onCancel={() => setAdding(false)} onDone={() => window.location.reload()} /></div>;

  return (
    <>
      <button className="switcher-btn" onClick={() => setOpen(true)}>{a.dynasty.name} ▾</button>
      {open && (
        <div className="gate-overlay" onClick={() => setOpen(false)}>
          <div className="gate-sheet" onClick={(e) => e.stopPropagation()}>
            <h3>Your dynasties</h3>
            {me.memberships.map((m) => (
              <button key={m.dynastyId} className={`gate-team ${m.dynastyId === a.dynastyId ? 'sel' : ''}`} onClick={() => m.dynastyId !== a.dynastyId && switchTo(m.dynastyId)}>
                <span className="nm">{m.dynasty.name}</span>
                <span className="meta">{m.team || 'No team yet'}{m.dynasty.mode === 'multi' ? ' · League' : ' · Solo'}</span>
              </button>
            ))}
            <button className="gate-btn secondary" onClick={() => setEditingCoach(true)}>Edit my coach</button>
            <button className="gate-btn secondary" onClick={() => setAdding(true)}>Start or join another</button>
            {isCommish && a.dynasty.mode === 'multi' && (
              invite ? (
                <div className="gate-invite">
                  <div className="gate-hint">Invite link (valid 14 days)</div>
                  <input className="gate-input" readOnly value={invite} onFocus={(e) => e.target.select()} />
                  <button className="gate-btn secondary" onClick={() => navigator.clipboard?.writeText(invite)}>Copy link</button>
                </div>
              ) : <button className="gate-btn secondary" onClick={makeInvite}>Create invite link</button>
            )}
            {err ? <div className="gate-error">{err}</div> : null}
            <button className="gate-link" onClick={signOut}>Sign out</button>
          </div>
        </div>
      )}
    </>
  );
}
