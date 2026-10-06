'use client';

import { useEffect, useState } from 'react';
import ClaimRulesForm, { matchCount, type ClaimRules, type MetaTeam } from './ClaimRulesForm';

// First screen for someone with no dynasty yet: start one, or join with a code.
export default function Onboarding({ onDone, canCancel, onCancel }: { onDone: () => void; canCancel?: boolean; onCancel?: () => void }) {
  const [view, setView] = useState<'choose' | 'create' | 'join'>('choose');
  const [name, setName] = useState('');
  const [mode, setMode] = useState<'solo' | 'multi'>('solo');
  const [rules, setRules] = useState<ClaimRules>({ allowPick: true, allowRandom: true, rerollLimit: 0, minOverall: null, maxOverall: null, conferences: [] });
  const [metaTeams, setMetaTeams] = useState<MetaTeam[]>([]);
  const [allConfs, setAllConfs] = useState<string[]>([]);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (view === 'create' && mode === 'multi' && !allConfs.length) {
      fetch('/api/teams/meta').then((r) => r.json()).then((b) => { setAllConfs(b.conferences || []); setMetaTeams(b.teams || []); }).catch(() => {});
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
    if (mode === 'multi' && metaTeams.length && matchCount(rules, metaTeams) === 0) { setError('No teams match your team selection settings. Widen them first.'); return; }
    if (mode === 'multi' && !rules.allowPick && !rules.allowRandom) { setError('Turn on picking or random draw so coaches can get a team.'); return; }
    const ok = await post('/api/dynasties', {
      name, mode, allow_pick: rules.allowPick, allow_random: rules.allowRandom, reroll_limit: rules.rerollLimit,
      team_pool: { conferences: rules.conferences, min_overall: rules.minOverall, max_overall: rules.maxOverall, teams: [] },
    });
    if (ok) onDone();
  }

  async function join() {
    const ok = await post('/api/join', { code });
    if (ok) onDone();
  }

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
              <>
                <p className="gate-hint">How coaches get a team. You can change this later under Community, then Rules.</p>
                <ClaimRulesForm value={rules} onChange={setRules} teams={metaTeams} conferences={allConfs} />
              </>
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
