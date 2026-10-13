'use client';

import { useEffect, useState } from 'react';
import { COMMISH_STEPS, MEMBER_STEPS, exampleUrl } from '@/lib/tutorial';

const SEEN_KEY = 'dhq-tutorial-v1';

export function tutorialSeen(): boolean {
  try { return localStorage.getItem(SEEN_KEY) === '1'; } catch { return true; }
}
function markSeen() {
  try { localStorage.setItem(SEEN_KEY, '1'); } catch { /* ignore */ }
}

/** Opens the walkthrough from anywhere (Help tab, upload screen). */
export function openTutorial() {
  window.dispatchEvent(new CustomEvent('dhq-tutorial'));
}

/**
 * First-time walkthrough: one card per step, swipe-free (Back / Next), with Skip.
 * Shows itself once per device; replay any time via openTutorial().
 */
export default function Tutorial({ isCommish }: { isCommish: boolean }) {
  const [open, setOpen] = useState(false);
  const [i, setI] = useState(0);
  const [big, setBig] = useState<string | null>(null);

  useEffect(() => {
    if (!tutorialSeen()) setOpen(true);
    const on = () => { setI(0); setBig(null); setOpen(true); };
    window.addEventListener('dhq-tutorial', on);
    return () => window.removeEventListener('dhq-tutorial', on);
  }, []);

  if (!open) return null;
  const steps = isCommish ? COMMISH_STEPS : MEMBER_STEPS;
  const step = steps[Math.min(i, steps.length - 1)];
  const last = i >= steps.length - 1;
  const close = () => { markSeen(); setOpen(false); };

  return (
    <div className="gate-overlay" role="dialog" aria-modal="true" aria-label="How Dynasty HQ works">
      <div className="gate-sheet">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span className="gate-hint">Step {i + 1} of {steps.length}</span>
          <button type="button" className="gate-link" onClick={close}>Skip</button>
        </div>
        <h3 style={{ fontSize: 18 }}>{step.title}</h3>
        {step.body.map((line, k) =>
          line.startsWith('• ') ? (
            <div key={k} style={{ fontSize: 14, lineHeight: 1.45, paddingLeft: 14, textIndent: -12 }}>{line}</div>
          ) : (
            <div key={k} style={{ fontSize: 14, lineHeight: 1.5 }}>{line}</div>
          )
        )}
        {step.warn ? (
          <div style={{ fontSize: 13, lineHeight: 1.45, fontWeight: 600, padding: '10px 12px', borderRadius: 6, border: '2px solid var(--dhq-red)', background: '#fff' }}>{step.warn}</div>
        ) : null}
        {step.shots ? (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {step.shots.map((s) => {
              const expanded = big === s.file;
              return (
                <button key={s.file} type="button" onClick={() => setBig(expanded ? null : s.file)}
                  style={{ gridColumn: expanded ? '1 / -1' : undefined, textAlign: 'left', padding: 0, border: '1px solid rgba(0,0,0,0.2)', borderRadius: 6, background: '#fff', cursor: 'pointer', overflow: 'hidden', textTransform: 'none', letterSpacing: 'normal' }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={exampleUrl(s.file)} alt={s.title} loading="lazy" style={{ width: '100%', display: 'block', aspectRatio: '16 / 9', objectFit: 'cover' }} />
                  <div style={{ padding: '6px 8px', fontSize: 12, lineHeight: 1.3 }}>
                    <strong>{s.title}</strong>
                    {s.note ? <div style={{ color: 'rgba(0,0,0,0.6)' }}>{s.note}</div> : null}
                    {!expanded ? <div style={{ color: 'rgba(0,0,0,0.45)' }}>Tap to enlarge</div> : null}
                  </div>
                </button>
              );
            })}
          </div>
        ) : null}
        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          {i > 0 ? <button type="button" className="gate-chip" style={{ padding: '10px 14px' }} onClick={() => { setBig(null); setI(i - 1); }}>Back</button> : null}
          <button type="button" className="gate-btn" style={{ flex: 1 }} onClick={() => { if (last) close(); else { setBig(null); setI(i + 1); } }}>
            {last ? 'Got it' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
}
