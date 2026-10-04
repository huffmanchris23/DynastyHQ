'use client';

import { useEffect, useState } from 'react';
import CoachAvatar from '@/components/CoachAvatar';
import { AVATARS } from '@/lib/avatars';

interface Options { offense: string[]; defense: string[]; pipelines: string[]; philosophies: string[] }

// Pick a coach look, name, alma mater, and (once the lists exist) playbooks, pipeline, philosophy.
export default function CoachSetup({ defaultName, color, onDone, onCancel }: { defaultName?: string; color?: string; onDone: () => void; onCancel?: () => void }) {
  const [name, setName] = useState(defaultName || '');
  const [avatar, setAvatar] = useState<number | null>(null);
  const [almaMater, setAlmaMater] = useState('');
  const [pipeline, setPipeline] = useState('');
  const [offense, setOffense] = useState('');
  const [defense, setDefense] = useState('');
  const [philosophy, setPhilosophy] = useState('');
  const [schools, setSchools] = useState<string[]>([]);
  const [opts, setOpts] = useState<Options>({ offense: [], defense: [], pipelines: [], philosophies: [] });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/teams/meta').then((r) => r.json()).then((b) => setSchools(b.schools || [])).catch(() => {});
    fetch('/api/coach').then((r) => r.json()).then((b) => {
      if (b.options) setOpts(b.options);
      if (b.coach) {
        setName(b.coach.name || ''); setAvatar(b.coach.avatar || null); setAlmaMater(b.coach.almaMater || '');
        setPipeline(b.coach.pipeline || ''); setOffense(b.coach.offense || ''); setDefense(b.coach.defense || ''); setPhilosophy(b.coach.philosophy || '');
      }
    }).catch(() => {});
  }, []);

  async function save() {
    setBusy(true); setError(null);
    const res = await fetch('/api/coach', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, avatar, almaMater, pipeline, offense, defense, philosophy }) });
    const out = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(out.error || 'Could not save.');
    onDone();
  }

  const select = (label: string, value: string, set: (v: string) => void, list: string[]) =>
    list.length ? (
      <label className="gate-field">{label}
        <select className="gate-input" value={value} onChange={(e) => set(e.target.value)}>
          <option value="">Choose…</option>
          {list.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      </label>
    ) : null;

  return (
    <div className="gate-wrap">
      <div className="gate-card">
        <h2>Create your coach</h2>
        <div className="gate-avatars" role="radiogroup" aria-label="Choose your coach">
          {AVATARS.map((a) => (
            <button key={a.id} type="button" role="radio" aria-checked={avatar === a.id} aria-label={a.label}
              className={`gate-avatar ${avatar === a.id ? 'on' : ''}`} onClick={() => setAvatar(a.id)}>
              <CoachAvatar id={a.id} color={color} size={64} />
            </button>
          ))}
        </div>
        <label className="gate-field">Coach name
          <input className="gate-input" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
        </label>
        {select('Alma mater', almaMater, setAlmaMater, schools)}
        {select('Recruiting pipeline', pipeline, setPipeline, opts.pipelines)}
        {select('Offensive playbook', offense, setOffense, opts.offense)}
        {select('Defensive playbook', defense, setDefense, opts.defense)}
        {select('Coaching philosophy', philosophy, setPhilosophy, opts.philosophies)}
        <button className="gate-btn" disabled={busy || avatar === null || name.trim().length < 2} onClick={save}>Save coach</button>
        {onCancel ? <button className="gate-link" onClick={onCancel}>Cancel</button> : null}
        {error ? <div className="gate-error">{error}</div> : null}
      </div>
    </div>
  );
}
