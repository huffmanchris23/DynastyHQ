'use client';

import { useEffect, useMemo, useState } from 'react';

interface PoolTeam { team_name: string; team_conference: string | null; team_overall: number | null; logo_url: string | null }
interface Rules { claimsOpen: boolean; allowPick: boolean; allowRandom: boolean; rerollLimit: number; rerollsLeft: number }

// Team claim: pick from the pool, or draw a random team (with commish-set rerolls).
export default function ClaimTeam({ dynastyId, dynastyName, onDone }: { dynastyId: string; dynastyName: string; onDone: () => void }) {
  const [teams, setTeams] = useState<PoolTeam[]>([]);
  const [rules, setRules] = useState<Rules | null>(null);
  const [commish, setCommish] = useState(false);
  const [q, setQ] = useState('');
  const [drawn, setDrawn] = useState<string | null>(null);
  const [rerollsLeft, setRerollsLeft] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  async function load() {
    const res = await fetch(`/api/dynasties/${dynastyId}/teams`);
    const b = await res.json();
    if (!res.ok) return setError(b.error || 'Could not load teams.');
    setTeams(b.available); setRules(b.rules); setCommish(b.commish); setRerollsLeft(b.rules.rerollsLeft); setLoaded(true);
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [dynastyId]);

  async function claim(body: any) {
    setBusy(true); setError(null);
    const res = await fetch(`/api/dynasties/${dynastyId}/claim`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const out = await res.json().catch(() => ({}));
    setBusy(false); setConfirm(null);
    if (!res.ok) { setError(out.error || 'Could not claim that team.'); load(); return; }
    if (body.action === 'pick') return onDone();
    setDrawn(out.team); setRerollsLeft(out.rerollsLeft);
  }

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? teams.filter((t) => t.team_name.toLowerCase().indexOf(s) > -1 || (t.team_conference || '').toLowerCase().indexOf(s) > -1) : teams;
  }, [teams, q]);

  if (drawn) {
    const t = teams.find((x) => x.team_name === drawn);
    return (
      <div className="gate-wrap"><div className="gate-card center">
        <h2>Your team</h2>
        {t?.logo_url ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={t.logo_url} alt="" width={96} height={96} /> : null}
        <div className="gate-drawn">{drawn}</div>
        <button className="gate-btn" onClick={onDone}>Keep {drawn}</button>
        {rerollsLeft > 0 && <button className="gate-btn secondary" disabled={busy} onClick={() => claim({ action: 'reroll' })}>Reroll ({rerollsLeft} left)</button>}
        {error ? <div className="gate-error">{error}</div> : null}
      </div></div>
    );
  }

  return (
    <div className="gate-wrap">
      <div className="gate-card">
        <h2>Choose your team</h2>
        <p className="gate-hint">{dynastyName}</p>
        {rules && !rules.claimsOpen && !commish ? <div className="gate-error">Team claiming is closed. Ask your commissioner.</div> : null}
        {loaded && !teams.length && rules && (rules.claimsOpen || commish) ? (
          <div className="gate-error">No teams are available in this dynasty&apos;s pool right now. Ask your commissioner to widen the team selection rules (Community, then Rules).</div>
        ) : null}
        {loaded && rules && !rules.allowPick && !rules.allowRandom && !commish ? <div className="gate-error">This dynasty has turned off both picking and random draws. Ask your commissioner.</div> : null}
        {rules?.allowRandom && (rules.claimsOpen || commish) ? (
          <button className="gate-btn" disabled={busy || !loaded || !teams.length} onClick={() => claim({ action: 'random' })}>
            Draw a random team{rules.rerollLimit ? ` (${rules.rerollLimit} reroll${rules.rerollLimit === 1 ? '' : 's'})` : ''}
          </button>
        ) : null}
        {rules?.allowPick && (rules.claimsOpen || commish) ? (
          <>
            <input className="gate-input" placeholder="Search teams or conferences" value={q} onChange={(e) => setQ(e.target.value)} />
            <div className="gate-teamlist">
              {shown.map((t) => (
                <button key={t.team_name} className={`gate-team ${confirm === t.team_name ? 'sel' : ''}`} onClick={() => setConfirm(t.team_name)}>
                  {t.logo_url ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={t.logo_url} alt="" width={28} height={28} /> : <span className="ph" />}
                  <span className="nm">{t.team_name}</span>
                  <span className="meta">{t.team_conference}{t.team_overall != null ? ` · ${t.team_overall}` : ''}</span>
                </button>
              ))}
              {!shown.length ? <div className="gate-hint">No teams match.</div> : null}
            </div>
            {confirm ? <button className="gate-btn" disabled={busy} onClick={() => claim({ action: 'pick', team: confirm })}>Take {confirm}</button> : null}
          </>
        ) : null}
        {error ? <div className="gate-error">{error}</div> : null}
      </div>
    </div>
  );
}
