'use client';

import { useEffect, useRef, useState } from 'react';

interface Group { label: string; items: string[] }
interface Options { offenseGroups: Group[]; defense: string[]; pipelines: string[]; philosophies: string[]; philosophyPicks: number }

function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return ((parts[0][0] || '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

// Center-crop to a square and shrink to 512px JPEG before anything leaves the phone.
async function shrinkToJpeg(file: File): Promise<string> {
  const bmp = await createImageBitmap(file);
  const side = Math.min(bmp.width, bmp.height);
  const canvas = document.createElement('canvas');
  canvas.width = 512; canvas.height = 512;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, 512, 512);
  return canvas.toDataURL('image/jpeg', 0.85);
}

function buildPrompt(color?: string) {
  const polo = color ? `a plain coaching polo in the color ${color}` : 'a plain navy coaching polo';
  return `Using the photo I attached, create a polished, stylized illustrated portrait of me as a college football head coach. Head and shoulders, facing the camera, confident expression, and my face clearly recognizable (same hair, skin tone, and features). I'm wearing ${polo} with a coaching headset around my neck. Simple clean background in a matching color, soft studio lighting, square 1:1 image. No text, no logos, no team names, no numbers.`;
}

export default function CoachSetup({ defaultName, color, onDone, onCancel }: { defaultName?: string; color?: string; onDone: () => void; onCancel?: () => void }) {
  const [name, setName] = useState(defaultName || '');
  const [image, setImage] = useState<string | null>(null);
  const [almaMater, setAlmaMater] = useState('');
  const [pipeline, setPipeline] = useState('');
  const [offense, setOffense] = useState('');
  const [defense, setDefense] = useState('');
  const [philosophy, setPhilosophy] = useState<string[]>([]);
  const [schools, setSchools] = useState<string[]>([]);
  const [opts, setOpts] = useState<Options>({ offenseGroups: [], defense: [], pipelines: [], philosophies: [], philosophyPicks: 3 });
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const prompt = buildPrompt(color);

  useEffect(() => {
    fetch('/api/teams/meta').then((r) => r.json()).then((b) => setSchools(b.schools || [])).catch(() => {});
    fetch('/api/coach').then((r) => r.json()).then((b) => {
      if (b.options) setOpts(b.options);
      if (b.coach) {
        setName(b.coach.name || ''); setImage(b.coach.image || null); setAlmaMater(b.coach.almaMater || '');
        setPipeline(b.coach.pipeline || ''); setOffense(b.coach.offense || ''); setDefense(b.coach.defense || '');
        setPhilosophy(b.coach.philosophy || []);
      }
    }).catch(() => {});
  }, []);

  async function pickFile(file: File | null) {
    if (!file) return;
    setUploading(true); setError(null);
    try {
      const imageBase64 = await shrinkToJpeg(file);
      const res = await fetch('/api/coach/image', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ imageBase64 }) });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(out.error || 'Upload failed.');
      setImage(out.url);
    } catch (e: any) {
      setError(e?.message || 'That image could not be used. Try a different one.');
    } finally {
      setUploading(false);
    }
  }

  function togglePick(p: string) {
    setPhilosophy((cur) => (cur.indexOf(p) > -1 ? cur.filter((x) => x !== p) : cur.length < opts.philosophyPicks ? cur.concat(p) : cur));
  }

  async function copyPrompt() {
    try { await navigator.clipboard.writeText(prompt); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* user can long-press to copy */ }
  }

  async function save() {
    setBusy(true); setError(null);
    const res = await fetch('/api/coach', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, image, almaMater, pipeline, offense, defense, philosophy }) });
    const out = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(out.error || 'Could not save.');
    onDone();
  }

  const complete = name.trim().length >= 2 && almaMater && pipeline && offense && defense && philosophy.length === opts.philosophyPicks;
  const field = (label: string, node: React.ReactNode) => <label className="gate-field">{label}{node}</label>;
  const plainSelect = (value: string, set: (v: string) => void, list: string[]) => (
    <select className="gate-input" value={value} onChange={(e) => set(e.target.value)}>
      <option value="">Choose…</option>
      {list.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  );

  return (
    <div className="gate-wrap">
      <div className="gate-card">
        <h2>Create your coach</h2>

        <div className="gate-portrait-row">
          <div className="gate-portrait" style={{ background: color || 'var(--dhq-navy)' }}>
            {image ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={image} alt="Your coach" /> : <span>{initialsOf(name)}</span>}
          </div>
          <div className="gate-portrait-actions">
            <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => pickFile(e.target.files?.[0] || null)} />
            <button className="gate-btn secondary" disabled={uploading} onClick={() => fileRef.current?.click()}>{uploading ? 'Uploading…' : image ? 'Replace image' : 'Upload coach image'}</button>
            {image ? <button className="gate-link" onClick={() => setImage(null)}>Use my initials instead</button> : <div className="gate-hint">No image? Your initials are used.</div>}
          </div>
        </div>

        <button className="gate-link" style={{ alignSelf: 'flex-start' }} onClick={() => setShowGuide(!showGuide)} aria-expanded={showGuide}>
          {showGuide ? 'Hide' : 'How do I make a coach image?'}
        </button>
        {showGuide ? (
          <div className="gate-guide">
            <ol>
              <li>Take a clear photo of yourself: face centered, good light, no sunglasses.</li>
              <li>Open ChatGPT (or Gemini, or any AI image tool that accepts photos) and attach your photo.</li>
              <li>Paste this prompt:</li>
            </ol>
            <div className="gate-prompt">{prompt}</div>
            <button className="gate-btn secondary" onClick={copyPrompt}>{copied ? 'Copied' : 'Copy prompt'}</button>
            <ol start={4}>
              <li>Not quite right? Tell it what to change, like &ldquo;less cartoonish&rdquo; or &ldquo;darker background,&rdquo; and try again.</li>
              <li>Save the image to your phone, then tap <strong>Upload coach image</strong> above.</li>
            </ol>
            <p className="gate-hint">Your photo goes only to the AI tool you choose. Dynasty HQ only ever receives the finished image you upload.</p>
          </div>
        ) : null}

        {field('Coach name', <input className="gate-input" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />)}
        {field('Alma mater', plainSelect(almaMater, setAlmaMater, schools))}
        {field('Recruiting pipeline', plainSelect(pipeline, setPipeline, opts.pipelines))}
        {field('Offensive playbook', (
          <select className="gate-input" value={offense} onChange={(e) => setOffense(e.target.value)}>
            <option value="">Choose…</option>
            {opts.offenseGroups.map((g) => (
              <optgroup key={g.label} label={g.label}>{g.items.map((o) => <option key={`${g.label}-${o}`} value={o}>{o}</option>)}</optgroup>
            ))}
          </select>
        ))}
        {field('Defensive playbook', plainSelect(defense, setDefense, opts.defense))}

        <div className="gate-field">
          Coaching philosophy: pick {opts.philosophyPicks} ({philosophy.length} of {opts.philosophyPicks})
          <div className="gate-chips">
            {opts.philosophies.map((p) => {
              const on = philosophy.indexOf(p) > -1;
              return (
                <button key={p} type="button" aria-pressed={on} className={`gate-chip ${on ? 'on' : ''}`}
                  disabled={!on && philosophy.length >= opts.philosophyPicks} onClick={() => togglePick(p)}>{p}</button>
              );
            })}
          </div>
        </div>

        <button className="gate-btn" disabled={busy || uploading || !complete} onClick={save}>Save coach</button>
        {onCancel ? <button className="gate-link" onClick={onCancel}>Cancel</button> : null}
        {error ? <div className="gate-error">{error}</div> : null}
      </div>
    </div>
  );
}
