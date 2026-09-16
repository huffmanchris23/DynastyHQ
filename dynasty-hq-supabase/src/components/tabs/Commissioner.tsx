'use client';

import { useRef, useState } from 'react';

type SlotStatus = 'idle' | 'uploading' | 'done' | 'error';

interface Slot {
  id: string;
  label: string;
}

// Order matters only for display — filenames/matching are driven by `id`,
// which must match SCREEN_TYPES in src/lib/ocrShared.ts.
const SLOTS: Slot[] = [
  { id: 'team_schedule_1', label: 'Team Schedule (1 of 2)' },
  { id: 'team_schedule_2', label: 'Team Schedule (2 of 2)' },
  { id: 'best_matchups', label: 'Best Matchups' },
  { id: 'conference_standings', label: 'Conference Standings' },
  { id: 'top25', label: 'Top 25' },
  { id: 'stats_offense_1', label: 'Offense Stats (1 of 2)' },
  { id: 'stats_offense_2', label: 'Offense Stats (2 of 2)' },
  { id: 'stats_defense_1', label: 'Defense Stats (1 of 2)' },
  { id: 'stats_defense_2', label: 'Defense Stats (2 of 2)' },
  { id: 'hot_seats', label: 'Hot Seats (Top 5)' },
  { id: 'heisman', label: 'Heisman Watch' },
];

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export default function Upload() {
  const [status, setStatus] = useState<Record<string, SlotStatus>>({});
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [processError, setProcessError] = useState<string | null>(null);
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  async function handlePick(slotId: string, file: File | null) {
    if (!file) return;
    setStatus((s) => ({ ...s, [slotId]: 'uploading' }));
    try {
      const imageBase64 = await fileToBase64(file);
      const res = await fetch('/api/ocr-upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slot: slotId, imageBase64 }),
      });
      if (!res.ok) throw new Error((await res.json())?.error || 'Upload failed');
      setStatus((s) => ({ ...s, [slotId]: 'done' }));
    } catch {
      setStatus((s) => ({ ...s, [slotId]: 'error' }));
    }
  }

  async function handleProcessWeek() {
    setProcessing(true);
    setResult(null);
    setProcessError(null);
    try {
      const res = await fetch('/api/ocr-process', { method: 'POST' });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Processing failed');
      setResult(json);
    } catch (err: any) {
      setProcessError(err?.message || String(err));
    } finally {
      setProcessing(false);
    }
  }

  const anyUploaded = Object.values(status).some((s) => s === 'done');

  return (
    <div className="stack-sm">
      <div className="card">
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Weekly Screenshots</div>
        <div style={{ fontSize: 12, color: 'rgba(0,0,0,0.5)' }}>
          Upload whichever screens you have for this week. Re-tapping a slot replaces its screenshot. Nothing gets
          processed until you hit Process Week below.
        </div>
      </div>

      {SLOTS.map((slot) => {
        const s = status[slot.id] || 'idle';
        return (
          <div className="card" key={slot.id} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ flex: 1, fontSize: 14, fontWeight: 500 }}>{slot.label}</div>
            <div style={{ fontSize: 18, width: 24, textAlign: 'center' }}>
              {s === 'done' ? '✅' : s === 'uploading' ? '⏳' : s === 'error' ? '⚠️' : ''}
            </div>
            <input
              ref={(el) => {
                inputRefs.current[slot.id] = el;
              }}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={(e) => handlePick(slot.id, e.target.files?.[0] || null)}
            />
            <button
              type="button"
              onClick={() => inputRefs.current[slot.id]?.click()}
              disabled={s === 'uploading'}
              style={{
                fontSize: 13,
                padding: '6px 12px',
                borderRadius: 8,
                border: '1px solid rgba(0,0,0,0.15)',
                background: 'var(--accent)',
                color: '#fff',
                fontWeight: 600,
              }}
            >
              {s === 'done' ? 'Replace' : 'Add Photo'}
            </button>
          </div>
        );
      })}

      <button
        type="button"
        onClick={handleProcessWeek}
        disabled={processing || !anyUploaded}
        style={{
          width: '100%',
          padding: '14px',
          borderRadius: 10,
          border: 'none',
          background: anyUploaded ? 'var(--primary)' : 'rgba(0,0,0,0.15)',
          color: '#fff',
          fontWeight: 700,
          fontSize: 15,
        }}
      >
        {processing ? 'Processing…' : 'Process Week'}
      </button>

      {processError ? (
        <div className="card" style={{ color: '#b00020' }}>
          {processError}
        </div>
      ) : null}

      {result ? (
        <div className="card">
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
            Week {result.week} processed
          </div>
          {result.message ? <div style={{ fontSize: 13 }}>{result.message}</div> : null}
          {(result.results || []).map((r: any, i: number) => (
            <div key={i} style={{ fontSize: 13, padding: '4px 0', borderTop: i ? '1px solid rgba(0,0,0,0.06)' : 'none' }}>
              <strong>{r.screen_type || r.file}</strong>:{' '}
              {r.status === 'success' || r.status === 'retried_success'
                ? `${r.rowsWritten} row(s) written${r.status === 'retried_success' ? ' (after retry)' : ''}`
                : r.status === 'skipped'
                ? `skipped — ${r.reason}`
                : `failed — ${r.error}`}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
