'use client';

import { useEffect, useState } from 'react';

// First screen for someone with no dynasty yet: start one, or join with a code.
export default function Onboarding({ onDone, canCancel, onCancel }: { onDone: () => void; canCancel?: boolean; onCancel?: () => void }) {
  const [view, setView] = useState<'choose' | 'create' | 'join'>('choose');
  const [name, setName] = useState('');
  const [mode, setMode] = useState<'solo' | 'multi'>('solo');
  const [allowPick, setAllowPick] = useState(true);
  const [allowRandom, setAllowRandom] = useState(true);
  const [rerolls, setRerolls] = useState(0);
  const [minOvr, setMinOvr] = useState('');
  const [maxOvr, setMaxOvr] = useState('');
  const [allConfs, setAllConfs] = useState<string[]>([]);
  const [confs, setConfs] = useState<string[]>([]);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (view === 'create' && mode === 'multi' && !allConfs.length) {
      fetch('/api/teams/meta').then((r) => r.json()).then((b) => setAllConfs(b.conferences || [])).catch(() => {});
    }
  }, [view, mode, allConfs.length]);

  async function post(url: string, body: any) {
    setBusy(true); setError(null);
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const out = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setError(out.error || 'Something went wrong.'); return false; }
    return true;
  }

  async function create() {
    const ok = await post('/api/dynasties', {
      name, mode, allow_pick: allowPick, allow_random: allowRandom, reroll_limit: rerolls,
      team_pool: { conferences: confs, min_overall: minOvr, max_overall: maxOvr, teams: [] },
    });
    if (ok) onDone();
  }

  async function join() {
    const ok = await post('/api/join', { code });
    if (ok) onDone();
  }

  const toggleConf = (c: string) => setConfs((cur) => (cur.indexOf(c) > -1 ? cur.filter((x) => x !== c) : cur.concat(c)));

  return (
    <div className="gate-wrap">
      <div className="gate-masthead">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icon-192.png" alt="" width={56} height={56} />
        <h1>Dynasty HQ</h1>
      </div>
      <div className="gate-card">
        {view === 'choose' && (
          <>
            <h2>Get started</h2>
            <button className="gate-btn" onClick={() => setView('create')}>Start a dynasty</button>
            <button className="gate-btn secondary" onClick={() => setView('join')}>Join with an invite code</button>
            {canCancel ? <button className="gate-link" onClick={onCancel}>Back</button> : null}
          </>
        )}

        {view === 'create' && (
          <>
            <h2>Start a dynasty</h2>
            <input className="gate-input" placeholder="Dynasty name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
            <div className="gate-seg">
              <button className={mode === 'solo' ? 'on' : ''} onClick={() => setMode('solo')}>Just me</button>
              <button className={mode === 'multi' ? 'on' : ''} onClick={() => setMode('multi')}>With friends</button>
            </div>
            {mode === 'multi' && (
              <div className="gate-rules">
                <p className="gate-hint">How members get a team. You can change this later.</p>
                <label className="gate-check"><input type="checkbox" checked={allowPick} onChange={(e) => setAllowPick(e.target.checked)} /> Members can pick their team</label>
                <label className="gate-check"><input type="checkbox" checked={allowRandom} onChange={(e) => setAllowRandom(e.target.checked)} /> Members can draw a random team</label>
                {allowRandom && (
                  <label className="gate-field">Rerolls allowed
                    <input className="gate-input small" type="number" min={0} max={10} value={rerolls} onChange={(e) => setRerolls(Number(e.target.value) || 0)} />
                  </label>
                )}
                <div className="gate-field">Team overall rating (optional)
                  <div className="gate-pair">
                    <input className="gate-input small" inputMode="numeric" placeholder="Min" value={minOvr} onChange={(e) => setMinOvr(e.target.value.replace(/\D/g, ''))} />
                    <input className="gate-input small" inputMode="numeric" placeholder="Max" value={maxOvr} onChange={(e) => setMaxOvr(e.target.value.replace(/\D/g, ''))} />
                  </div>
                </div>
                {allConfs.length > 0 && (
                  <div className="gate-field">Limit to conferences (none selected = all)
                    <div className="gate-chips">
                      {allConfs.map((c) => (
                        <button key={c} className={`gate-chip ${confs.indexOf(c) > -1 ? 'on' : ''}`} onClick={() => toggleConf(c)}>{c}</button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
            <button className="gate-btn" disabled={busy || name.trim().length < 2} onClick={create}>Create dynasty</button>
            <button className="gate-link" onClick={() => setView('choose')}>Back</button>
          </>
        )}

        {view === 'join' && (
          <>
            <h2>Join a dynasty</h2>
            <input className="gate-input code" placeholder="Invite code" autoCapitalize="characters" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} />
            <button className="gate-btn" disabled={busy || code.trim().length < 4} onClick={join}>Join</button>
            <button className="gate-link" onClick={() => setView('choose')}>Back</button>
          </>
        )}
        {error ? <div className="gate-error">{error}</div> : null}
      </div>
    </div>
  );
}
