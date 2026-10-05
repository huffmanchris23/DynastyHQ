'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { weekLabel } from '@/lib/weeks';

type SlotStatus = 'idle' | 'uploading' | 'done' | 'error';

// Display labels; ids must match SCREEN_TYPES in src/lib/ocrShared.ts. The API
// tells us which slots this person may upload (members get their own five).
const LABELS: Record<string, string> = {
  team_schedule_1: 'Team Schedule (1 of 2)',
  team_schedule_2: 'Team Schedule (2 of 2)',
  last_week_results: "Last Week's Results",
  best_matchup_1: 'Matchup 1 of 5',
  best_matchup_2: 'Matchup 2 of 5',
  best_matchup_3: 'Matchup 3 of 5',
  best_matchup_4: 'Matchup 4 of 5',
  best_matchup_5: 'Matchup 5 of 5',
  conference_standings: 'Conference Standings',
  top25: 'Top 25',
  stats_offense_1: 'Offense Stats (1 of 2)',
  stats_offense_2: 'Offense Stats (2 of 2, only if your team was not on the first)',
  stats_defense_1: 'Defense Stats (1 of 2)',
  stats_defense_2: 'Defense Stats (2 of 2, only if your team was not on the first)',
  hot_seats: 'Hot Seats (Top 5)',
  heisman: 'Heisman Watch',
};

interface MemberReady { userId: string; team: string; name: string; role: string; ready: boolean; missing: string[] }
interface WeekState {
  isCommish: boolean; season: number; liveWeek: number | null; openWeek: number | null;
  countdownEndsAt: string | null; weekLengthHours: number | null; members: MemberReady[];
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function countdownText(iso: string | null): string | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return 'Countdown finished';
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return h >= 24 ? `${Math.floor(h / 24)}d ${h % 24}h left to advance` : `${h}h ${m}m left to advance`;
}

const btn = (primary: boolean, disabled?: boolean): React.CSSProperties => ({
  width: '100%', padding: '14px', borderRadius: 10, fontWeight: 700, fontSize: 15,
  border: primary ? 'none' : '1px solid rgba(0,0,0,0.15)',
  background: primary ? (disabled ? 'rgba(0,0,0,0.15)' : 'var(--primary)') : 'transparent',
  color: primary ? 'var(--on-primary)' : 'var(--primary)',
});

export default function Upload() {
  const [state, setState] = useState<WeekState | null>(null);
  const [slots, setSlots] = useState<string[]>([]);
  const [status, setStatus] = useState<Record<string, SlotStatus>>({});
  const [checking, setChecking] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [pickedWeek, setPickedWeek] = useState<number | null>(null);
  const [notReady, setNotReady] = useState<MemberReady[] | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const refresh = useCallback(async () => {
    setChecking(true);
    try {
      const [wk, up] = await Promise.all([fetch('/api/ocr-advance-week').then((r) => r.json()), fetch('/api/ocr-upload').then((r) => r.json())]);
      if (!wk.error) setState(wk);
      if (Array.isArray(up.slots)) setSlots(up.slots);
      const initial: Record<string, SlotStatus> = {};
      (up.uploadedSlots || []).forEach((s: string) => { initial[s] = 'done'; });
      setStatus(initial);
    } catch {
      /* non-fatal: panel just stays empty */
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  async function handlePick(slotId: string, file: File | null) {
    if (!file) return;
    setStatus((s) => ({ ...s, [slotId]: 'uploading' }));
    setError(null);
    try {
      const imageBase64 = await fileToBase64(file);
      const res = await fetch('/api/ocr-upload', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slot: slotId, imageBase64 }) });
      if (!res.ok) throw new Error((await res.json())?.error || 'Upload failed');
      setStatus((s) => ({ ...s, [slotId]: 'done' }));
    } catch (e: any) {
      setStatus((s) => ({ ...s, [slotId]: 'error' }));
      setError(e?.message || 'Upload failed');
    }
  }

  async function handleProcess() {
    setProcessing(true); setResult(null); setError(null);
    try {
      const res = await fetch('/api/ocr-process', { method: 'POST' });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Processing failed');
      setResult(json);
      await refresh();
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setProcessing(false);
    }
  }

  async function week(action: 'open' | 'advance', extra: any = {}) {
    setBusy(true); setError(null);
    try {
      const res = await fetch('/api/ocr-advance-week', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...extra }) });
      const json = await res.json();
      if (res.status === 409 && json.notReady) { setNotReady(json.notReady); return; }
      if (!res.ok) throw new Error(json?.error || 'Could not do that');
      setNotReady(null); setResult(null);
      await refresh();
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  if (!state) return <div className="card" style={{ fontSize: 13 }}>{checking ? 'Loading…' : 'Could not load the week.'}</div>;

  const open = state.openWeek;
  const anyUploaded = Object.values(status).some((s) => s === 'done');
  const cd = countdownText(state.countdownEndsAt);

  return (
    <div className="stack-sm">
      <div className="card">
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>
          Weekly Uploads{open !== null ? ` — ${weekLabel(open)}` : ''}
        </div>
        <div style={{ fontSize: 12, color: 'rgba(0,0,0,0.55)' }}>
          {open !== null
            ? state.isCommish
              ? 'Upload your screens, then Process. When everyone is ready, Advance & Go Live to publish this week to the whole league.'
              : 'Upload your five screens, then Process. Your commissioner publishes the week once everyone is ready.'
            : state.liveWeek !== null
            ? `Week ${state.liveWeek} is live.${cd ? ` ${cd}.` : ''} Uploads open when your commissioner starts the next week.`
            : 'Nothing is live yet. Uploads open when your commissioner starts the first week.'}
        </div>
      </div>

      {open === null && state.isCommish ? (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>
            {state.liveWeek === null ? 'Which week are you on?' : `Open ${weekLabel(state.liveWeek + 1)}`}
          </div>
          {state.liveWeek === null ? (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8 }}>
                {Array.from({ length: 20 }, (_, n) => (
                  <button key={n} type="button" onClick={() => setPickedWeek(n)}
                    style={{ padding: '12px 0', borderRadius: 8, fontWeight: 700, fontSize: 15,
                      border: pickedWeek === n ? '2px solid var(--primary)' : '1px solid rgba(0,0,0,0.18)',
                      background: pickedWeek === n ? 'var(--primary)' : 'transparent',
                      color: pickedWeek === n ? 'var(--on-primary)' : 'inherit' }}>
                    {n}
                  </button>
                ))}
              </div>
              <div style={{ fontSize: 12, color: 'rgba(0,0,0,0.55)', minHeight: 16 }}>
                {pickedWeek === null ? 'Tap the current week.' : weekLabel(pickedWeek)}
              </div>
            </>
          ) : null}
          <button type="button" style={btn(true, busy)} disabled={busy || (state.liveWeek === null && pickedWeek === null)}
            onClick={() => week('open', state.liveWeek === null ? { week: pickedWeek } : {})}>
            {busy ? 'Opening…' : 'Open week for uploads'}
          </button>
        </div>
      ) : null}

      {open !== null ? (
        <>
          {slots.map((id) => {
            const s = status[id] || 'idle';
            return (
              <div className="card" key={id} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ flex: 1, fontSize: 14, fontWeight: 500 }}>{LABELS[id] || id}</div>
                <div style={{ fontSize: 18, width: 24, textAlign: 'center' }}>{s === 'done' ? '✅' : s === 'uploading' ? '⏳' : s === 'error' ? '⚠️' : ''}</div>
                <input ref={(el) => { inputRefs.current[id] = el; }} type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => handlePick(id, e.target.files?.[0] || null)} />
                <button type="button" onClick={() => inputRefs.current[id]?.click()} disabled={s === 'uploading'}
                  style={{ fontSize: 13, padding: '6px 12px', borderRadius: 8, border: '1px solid rgba(0,0,0,0.15)', background: 'var(--primary)', color: 'var(--on-primary)', fontWeight: 600 }}>
                  {s === 'done' ? 'Replace' : 'Add Photo'}
                </button>
              </div>
            );
          })}

          <button type="button" onClick={handleProcess} disabled={processing || checking || !anyUploaded} style={btn(true, processing || checking || !anyUploaded)}>
            {processing ? 'Processing…' : checking ? 'Checking…' : 'Process my uploads'}
          </button>
        </>
      ) : null}

      {error ? <div className="card" style={{ color: '#b00020' }}>{error}</div> : null}

      {result ? (
        <div className="card">
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Week {result.week} processed</div>
          {result.message ? <div style={{ fontSize: 13 }}>{result.message}</div> : null}
          {(result.results || []).map((r: any, i: number) => (
            <div key={i} style={{ fontSize: 13, padding: '4px 0', borderTop: i ? '1px solid rgba(0,0,0,0.06)' : 'none' }}>
              <strong>{r.screen_type || r.file}</strong>:{' '}
              {r.status === 'success' || r.status === 'retried_success'
                ? `${r.rowsWritten} row(s) written${r.status === 'retried_success' ? ' (after retry)' : ''}`
                : r.status === 'skipped' ? `skipped — ${r.reason}` : `failed — ${r.error}`}
              {r.issues && r.issues.length ? <div style={{ color: '#b00020', fontSize: 11, marginTop: 2 }}>{r.issues.length} row(s) had issues — see audit log</div> : null}
            </div>
          ))}
          {[
            { label: 'Game preview', v: result.gamePreviewSync },
            { label: 'Game odds', v: result.gamePreviewOdds },
            { label: 'Broadcast engine', v: result.broadcast },
            { label: 'Content engine', v: result.content },
          ].map(({ label, v }) =>
            v ? (
              <div key={label} style={{ fontSize: 13, padding: '4px 0', borderTop: '1px solid rgba(0,0,0,0.06)' }}>
                <strong>{label}</strong>:{' '}
                {v.error ? <span style={{ color: '#b00020' }}>failed — {v.error}</span> : v.skipped ? `skipped — ${v.reason}` : `${v.written ?? v.assigned ?? ((v.inserted || 0) + (v.updated || 0))} row(s) written`}
                {v.issues && v.issues.length ? <div style={{ color: '#b00020', fontSize: 11, marginTop: 2 }}>{v.issues.join(' | ')}</div> : null}
              </div>
            ) : null
          )}
          {result.usageTotals ? (
            <div style={{ fontSize: 12, padding: '6px 0 0', marginTop: 4, borderTop: '1px solid rgba(0,0,0,0.06)', opacity: 0.75 }}>
              <strong>Token usage</strong>: {result.usageTotals.ocrCalls} OCR call(s) ({result.usageTotals.croppedCalls} cropped) · {result.usageTotals.ocrInputTokens.toLocaleString()} in / {result.usageTotals.ocrOutputTokens.toLocaleString()} out · est. ${result.usageTotals.ocrEstCostUsd.toFixed(3)}
            </div>
          ) : null}
        </div>
      ) : null}

      {open !== null ? (
        <div className="card">
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Who is ready</div>
          {state.members.length === 0 ? <div style={{ fontSize: 12, opacity: 0.6 }}>No members with a team yet.</div> : null}
          {state.members.map((m) => (
            <div key={m.userId} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 13, padding: '5px 0', borderTop: '1px solid rgba(0,0,0,0.06)' }}>
              <span>{m.team}{m.name ? ` · ${m.name}` : ''}</span>
              <span style={{ fontWeight: 600, color: m.ready ? '#1b7a3a' : '#b00020' }} title={m.missing.join(', ')}>{m.ready ? 'Ready' : 'Not ready'}</span>
            </div>
          ))}
        </div>
      ) : null}

      {open !== null && state.isCommish ? (
        <>
          {notReady ? (
            <div className="card" style={{ fontSize: 13 }}>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>Not everyone is ready:</div>
              {notReady.map((m) => <div key={m.userId}>{m.team} — missing {m.missing.join(', ')}</div>)}
              <button type="button" style={{ ...btn(false), marginTop: 10 }} disabled={busy} onClick={() => week('advance', { force: true })}>Go live anyway</button>
            </div>
          ) : null}
          <button type="button" style={btn(false)} disabled={busy} onClick={() => week('advance')}>
            {busy ? 'Publishing…' : `Advance & Go Live (Week ${open})`}
          </button>
          <div style={{ fontSize: 11, color: 'rgba(0,0,0,0.45)', textAlign: 'center' }}>
            Publishes this week to every member at once and starts the countdown.
          </div>
        </>
      ) : null}
    </div>
  );
}
