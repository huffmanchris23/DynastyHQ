'use client';

import { useEffect, useState } from 'react';

const small: React.CSSProperties = { fontSize: 12, color: 'rgba(0,0,0,0.55)' };
const btn = (primary = false, disabled = false): React.CSSProperties => ({
  padding: '10px 14px', borderRadius: 8, fontWeight: 700, fontSize: 14,
  border: primary ? 'none' : '1px solid rgba(0,0,0,0.18)',
  background: primary ? (disabled ? 'rgba(0,0,0,0.15)' : 'var(--primary)') : 'transparent',
  color: primary ? 'var(--on-primary)' : 'var(--primary)', cursor: disabled ? 'default' : 'pointer',
});
const STATUS: Record<string, string> = { open: 'Received', planned: 'Planned', done: 'Done', closed: 'Closed' };

function useArticles() {
  const [data, setData] = useState<{ articles: any[]; contactEmail: string | null } | null>(null);
  useEffect(() => { fetch('/api/help').then((r) => r.json()).then(setData).catch(() => setData({ articles: [], contactEmail: null })); }, []);
  return data;
}

function Tips() {
  const d = useArticles();
  if (!d) return <div className="card" style={small}>Loading…</div>;
  const tips = d.articles.filter((a) => a.kind === 'tip');
  return (
    <div className="stack-sm">
      {tips.length === 0 ? <div className="card" style={small}>No tips yet.</div> : null}
      {tips.map((t) => (
        <div className="card" key={t.id}>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>{t.title}</div>
          <div style={{ fontSize: 14, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{t.body}</div>
        </div>
      ))}
    </div>
  );
}

function Faq() {
  const d = useArticles();
  if (!d) return <div className="card" style={small}>Loading…</div>;
  const faqs = d.articles.filter((a) => a.kind === 'faq');
  return (
    <div className="stack-sm">
      {faqs.length === 0 ? <div className="card" style={small}>No questions yet.</div> : null}
      {faqs.map((f) => (
        <details className="card" key={f.id}>
          <summary style={{ fontWeight: 700, fontSize: 15, cursor: 'pointer' }}>{f.title}</summary>
          <div style={{ fontSize: 14, lineHeight: 1.5, whiteSpace: 'pre-wrap', marginTop: 8 }}>{f.body}</div>
        </details>
      ))}
    </div>
  );
}

function Support() {
  const d = useArticles();
  const [reports, setReports] = useState<any[] | null>(null);
  useEffect(() => { fetch('/api/help/reports').then((r) => r.json()).then((b) => setReports(b.reports || [])).catch(() => setReports([])); }, []);
  return (
    <div className="stack-sm">
      <div className="card" style={{ fontSize: 14, lineHeight: 1.55 }}>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 6 }}>Need a hand?</div>
        <p style={{ margin: '0 0 8px' }}><strong>League questions</strong> (rules, schedules, your team): ask your commissioner on the Message Board.</p>
        <p style={{ margin: '0 0 8px' }}><strong>Something in the app is broken:</strong> use Report a Bug. It sends the page you were on and your device automatically.</p>
        <p style={{ margin: 0 }}><strong>Quick answers:</strong> check the FAQs first.{d?.contactEmail ? <> You can also email <a href={`mailto:${d.contactEmail}`}>{d.contactEmail}</a>.</> : null}</p>
      </div>
      <div className="card">
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 6 }}>Your reports</div>
        {reports === null ? <div style={small}>Loading…</div> : null}
        {reports && reports.length === 0 ? <div style={small}>You have not sent any reports.</div> : null}
        {(reports || []).map((r) => (
          <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 13, padding: '6px 0', borderTop: '1px solid rgba(0,0,0,0.06)' }}>
            <span>{r.kind === 'bug' ? '🐞' : '💡'} {r.title}</span>
            <span style={{ fontWeight: 700, color: r.status === 'done' ? '#1b7a3a' : 'rgba(0,0,0,0.6)' }}>{STATUS[r.status] || r.status}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ReportForm({ kind, page }: { kind: 'bug' | 'feature'; page: string }) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const bug = kind === 'bug';

  async function send() {
    setBusy(true); setErr(null);
    const res = await fetch('/api/help/reports', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind, title, body, page }) });
    const out = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setErr(out.error || 'Could not send that.');
    setSent(true); setTitle(''); setBody('');
  }

  if (sent) {
    return (
      <div className="card" style={{ textAlign: 'center' }}>
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>Thanks, got it.</div>
        <div style={small}>{bug ? 'Your bug report was sent.' : 'Your idea was sent.'} You can follow its status under Support.</div>
        <button type="button" style={{ ...btn(), marginTop: 12 }} onClick={() => setSent(false)}>Send another</button>
      </div>
    );
  }
  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ fontWeight: 700, fontSize: 15 }}>{bug ? 'Report a bug' : 'Request a feature'}</div>
      <input className="gate-input" placeholder={bug ? 'What went wrong? (short)' : 'What would you like? (short)'} maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} />
      <textarea className="gate-input" rows={6} maxLength={3000} placeholder={bug ? 'What were you doing, what did you expect, and what happened instead?' : 'Describe it, and why it would help your league.'} value={body} onChange={(e) => setBody(e.target.value)} style={{ resize: 'vertical' }} />
      <div style={small}>{bug ? 'The page you were on and your device type are attached automatically.' : 'The page you are on is attached so we know where the idea came from.'}</div>
      <button type="button" style={btn(true, busy || title.trim().length < 3 || body.trim().length < 5)} disabled={busy || title.trim().length < 3 || body.trim().length < 5} onClick={send}>{busy ? 'Sending…' : 'Send'}</button>
      {err ? <div className="gate-error">{err}</div> : null}
    </div>
  );
}

export default function Help({ subtab, page }: { subtab: string | null; page: string }) {
  switch (subtab) {
    case 'support': return <Support />;
    case 'faq': return <Faq />;
    case 'bug': return <ReportForm kind="bug" page={page} />;
    case 'feature': return <ReportForm kind="feature" page={page} />;
    case 'tips':
    default: return <Tips />;
  }
}
