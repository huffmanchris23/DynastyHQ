'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { DashboardData } from '@/lib/types';

const small: React.CSSProperties = { fontSize: 12, color: 'rgba(0,0,0,0.55)' };
const btn = (primary = false, disabled = false): React.CSSProperties => ({
  padding: '10px 14px', borderRadius: 8, fontWeight: 700, fontSize: 14,
  border: primary ? 'none' : '1px solid rgba(0,0,0,0.18)',
  background: primary ? (disabled ? 'rgba(0,0,0,0.15)' : 'var(--primary)') : 'transparent',
  color: primary ? 'var(--on-primary)' : 'var(--primary)', cursor: disabled ? 'default' : 'pointer',
});
const input: React.CSSProperties = { width: '100%', padding: '9px 10px', borderRadius: 6, border: '1px solid rgba(0,0,0,0.25)', background: '#fff', fontSize: 14, boxSizing: 'border-box' };

const DEFAULT_AWARDS = ['Heisman Trophy', 'Broyles Award (Coordinator of the Year)', 'Coach of the Year'];
interface AwardRow { award: string; winnerName: string; winnerTeam: string; detail: string }
const blank = (award: string): AwardRow => ({ award, winnerName: '', winnerTeam: '', detail: '' });

function toBase64(file: File): Promise<string> {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => rej(r.error); r.readAsDataURL(file); });
}

/** Commissioner: after the final week, record the season's champion and awards. */
export default function HistoryUpload({ d }: { d: DashboardData }) {
  const teams = useMemo(() => Array.from(new Set((d.assets || []).map((a) => a.TEAM_NAME).filter(Boolean) as string[])).sort(), [d.assets]);
  const [season, setSeason] = useState<number | null>(null);
  const [currentSeason, setCurrentSeason] = useState(1);
  const [champion, setChampion] = useState('');
  const [runnerUp, setRunnerUp] = useState('');
  const [score, setScore] = useState('');
  const [awards, setAwards] = useState<AwardRow[]>(DEFAULT_AWARDS.map(blank));
  const [scanning, setScanning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Load the season's saved entry (so it can be edited), starting with the current season.
  useEffect(() => {
    let live = true;
    fetch(`/api/history${season ? `?season=${season}` : ''}`).then((r) => r.json()).then((b) => {
      if (!live || !b) return;
      const s = season ?? b.currentSeason ?? 1;
      if (season === null) { setSeason(s); setCurrentSeason(b.currentSeason ?? 1); }
      const saved = b.saved || (season === null ? { season: (b.champions || []).find((x: any) => x.season === s) || null, awards: (b.awards || []).filter((a: any) => a.season === s) } : null);
      setChampion(saved?.season?.champion_team || ''); setRunnerUp(saved?.season?.runner_up_team || ''); setScore(saved?.season?.title_score || '');
      const have: AwardRow[] = (saved?.awards || []).map((a: any) => ({ award: a.award, winnerName: a.winner_name || '', winnerTeam: a.winner_team || '', detail: a.detail || '' }));
      const defaults = DEFAULT_AWARDS.filter((n) => !have.some((h) => h.award === n)).map(blank);
      setAwards(have.length ? [...have, ...defaults] : DEFAULT_AWARDS.map(blank));
    }).catch(() => {});
    return () => { live = false; };
  }, [season]);

  async function scan(file: File) {
    setScanning(true); setMsg(null);
    try {
      const imageBase64 = await toBase64(file);
      const res = await fetch('/api/history/scan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ imageBase64 }) });
      const b = await res.json();
      if (!res.ok) throw new Error(b.error || 'Could not read it');
      if (b.champion) setChampion(b.champion);
      if (b.runnerUp) setRunnerUp(b.runnerUp);
      if (b.score) setScore(b.score);
      setMsg(b.champion
        ? { ok: true, text: `Read from the bracket: ${b.champion} won${b.runnerUp ? ` over ${b.runnerUp}` : ''}. Check it below, then save.` }
        : { ok: false, text: b.read?.champion ? `It read "${b.read.champion}" but that isn't a team name here. Pick the champion below.` : "Couldn't find a champion in that screenshot. Pick the teams below, or make sure the final has been played." });
    } catch (e: any) { setMsg({ ok: false, text: e.message || String(e) }); }
    setScanning(false);
    if (fileRef.current) fileRef.current.value = '';
  }

  async function save() {
    setSaving(true); setMsg(null);
    try {
      const res = await fetch('/api/history', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ season, championTeam: champion, runnerUpTeam: runnerUp, titleScore: score, awards }) });
      const b = await res.json();
      if (!res.ok) throw new Error(b.error || 'Could not save');
      setMsg({ ok: true, text: `Season ${season} saved.` });
    } catch (e: any) { setMsg({ ok: false, text: e.message || String(e) }); }
    setSaving(false);
  }

  const setAward = (i: number, patch: Partial<AwardRow>) => setAwards((a) => a.map((r, k) => (k === i ? { ...r, ...patch } : r)));
  const seasonOptions = Array.from({ length: Math.max(currentSeason, season || 1) }, (_, i) => i + 1).reverse();
  const teamSelect = (value: string, onChange: (v: string) => void) => (
    <select value={value} onChange={(e) => onChange(e.target.value)} style={input}>
      <option value="">Choose a team</option>
      {teams.map((t) => <option key={t} value={t}>{t}</option>)}
    </select>
  );

  return (
    <div className="stack-sm">
      <div className="card">
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>History Upload</div>
        <div style={small}>Once the final week is done, record the season&rsquo;s champion and awards. Everyone can browse them in the History tab.</div>
        <div style={{ marginTop: 10 }}>
          <div style={small}>Season</div>
          <select value={season ?? ''} onChange={(e) => setSeason(Number(e.target.value))} style={input}>
            {seasonOptions.map((s) => <option key={s} value={s}>Season {s}</option>)}
          </select>
        </div>
      </div>

      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>National champion</div>
        <div style={small}>Upload a screenshot of the final CFB Playoff bracket and it fills this in. Or choose the teams yourself.</div>
        <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) scan(f); }} />
        <button type="button" style={btn(false, scanning)} disabled={scanning} onClick={() => fileRef.current?.click()}>{scanning ? 'Reading the bracket…' : 'Upload playoff bracket'}</button>
        {scanning ? <div style={{ ...small, fontWeight: 600 }}>Keep this screen open until it finishes.</div> : null}
        <div><div style={small}>Champion</div>{teamSelect(champion, setChampion)}</div>
        <div><div style={small}>Runner-up</div>{teamSelect(runnerUp, setRunnerUp)}</div>
        <div><div style={small}>Title game score (optional)</div><input style={input} value={score} maxLength={40} placeholder="34-27" onChange={(e) => setScore(e.target.value)} /></div>
      </div>

      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>Awards</div>
        {awards.map((a, i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingTop: i ? 10 : 0, borderTop: i ? '1px solid rgba(0,0,0,0.08)' : 'none' }}>
            <input style={{ ...input, fontWeight: 700 }} value={a.award} maxLength={80} onChange={(e) => setAward(i, { award: e.target.value })} aria-label="Award name" />
            <input style={input} value={a.winnerName} maxLength={120} placeholder="Winner (player or coach name)" onChange={(e) => setAward(i, { winnerName: e.target.value })} />
            {teamSelect(a.winnerTeam, (v) => setAward(i, { winnerTeam: v }))}
            <input style={input} value={a.detail} maxLength={120} placeholder="Position, year, or notes (optional)" onChange={(e) => setAward(i, { detail: e.target.value })} />
            {!DEFAULT_AWARDS.includes(a.award) ? <button type="button" className="gate-link" style={{ alignSelf: 'flex-start' }} onClick={() => setAwards((all) => all.filter((_, k) => k !== i))}>Remove this award</button> : null}
          </div>
        ))}
        <button type="button" style={btn()} onClick={() => setAwards((a) => [...a, blank('')])}>Add another award</button>
      </div>

      {msg ? <div className="card" style={{ fontSize: 13, color: msg.ok ? '#1b7a3a' : '#b00020' }}>{msg.text}</div> : null}
      <button type="button" style={btn(true, saving || !season)} disabled={saving || !season} onClick={save}>{saving ? 'Saving…' : `Save Season ${season ?? ''}`}</button>
    </div>
  );
}
