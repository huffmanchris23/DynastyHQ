'use client';

import { useCallback, useEffect, useState } from 'react';
import type { DashboardData } from '@/lib/types';
import Badge from '@/components/shared/Badge';
import Upload from '@/components/tabs/Commissioner';
import { weekLabel } from '@/lib/weeks';

/* ---------------------------------- helpers ---------------------------------- */

const btn = (primary = false, disabled = false): React.CSSProperties => ({
  padding: '10px 14px', borderRadius: 8, fontWeight: 700, fontSize: 14,
  border: primary ? 'none' : '1px solid rgba(0,0,0,0.18)',
  background: primary ? (disabled ? 'rgba(0,0,0,0.15)' : 'var(--primary)') : 'transparent',
  color: primary ? 'var(--on-primary)' : 'var(--primary)', cursor: disabled ? 'default' : 'pointer',
});
const small: React.CSSProperties = { fontSize: 12, color: 'rgba(0,0,0,0.55)' };
const POS: Record<string, string> = { HC: 'Head Coach', OC: 'Offensive Coordinator', DC: 'Defensive Coordinator' };

function ago(iso: string): string {
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

async function api(url: string, method = 'GET', body?: any) {
  const res = await fetch(url, { method, headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || 'Something went wrong.');
  return json;
}

function Err({ msg }: { msg: string | null }) {
  return msg ? <div className="card" style={{ color: '#b00020', fontSize: 13 }}>{msg}</div> : null;
}

/* ----------------------------------- users ----------------------------------- */

function Users({ d }: { d: DashboardData }) {
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [invite, setInvite] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const dynastyId = d.viewer?.dynastyId;

  const load = useCallback(() => api('/api/community/users').then(setData).catch((e) => setErr(e.message)), []);
  useEffect(() => { load(); }, [load]);

  async function makeInvite() {
    setBusy(true); setErr(null);
    try {
      const r = await api(`/api/dynasties/${dynastyId}/invites`, 'POST', { expiresInDays: 14 });
      setInvite(`${window.location.origin}/join/${r.code}`);
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }
  async function toggleClaims() {
    setBusy(true); setErr(null);
    try { await api(`/api/dynasties/${dynastyId}`, 'PATCH', { claims_open: !data.claimsOpen }); await load(); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }

  if (!data) return <div className="card" style={small}>{err || 'Loading…'}</div>;
  const withTeam = data.members.filter((m: any) => m.team);
  const readyCount = withTeam.filter((m: any) => m.ready).length;

  return (
    <div className="stack-sm">
      <div className="card">
        <div style={{ fontSize: 14, fontWeight: 600 }}>
          {data.openWeek !== null ? `${weekLabel(data.openWeek)} is open for uploads` : data.liveWeek !== null ? `${weekLabel(data.liveWeek)} is live` : 'Waiting for the first week'}
        </div>
        <div style={small}>
          {data.openWeek !== null ? `${readyCount} of ${withTeam.length} coaches ready` : `${data.members.length} coach${data.members.length === 1 ? '' : 'es'} in this dynasty`}
        </div>
      </div>

      {data.members.map((m: any) => (
        <div className="card" key={m.userId} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {m.team ? <Badge text={m.team} size={40} logoUrl={m.logo} /> : <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(0,0,0,0.08)' }} />}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 15 }}>{m.team || 'No team yet'}</div>
            <div style={{ ...small, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {m.name}{m.position ? ` · ${m.position}` : ''}{m.role !== 'member' ? ` · ${m.role === 'commish' ? 'Commissioner' : 'Co-commissioner'}` : ''}
            </div>
            {m.missing && m.missing.length ? <div style={{ fontSize: 11, color: '#b00020' }}>Missing: {m.missing.join(', ')}</div> : null}
          </div>
          {m.ready !== null ? (
            <span style={{ fontWeight: 700, fontSize: 12, padding: '4px 10px', borderRadius: 999, background: m.ready ? '#e2f3e7' : '#fbe6e6', color: m.ready ? '#1b7a3a' : '#b00020' }}>
              {m.ready ? 'Ready' : 'Not ready'}
            </span>
          ) : null}
        </div>
      ))}

      {data.isCommish ? (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>Commissioner tools</div>
          {invite ? (
            <>
              <div style={small}>Invite link (valid 14 days)</div>
              <input className="gate-input" readOnly value={invite} onFocus={(e) => e.target.select()} />
              <button type="button" style={btn()} onClick={() => navigator.clipboard?.writeText(invite)}>Copy link</button>
            </>
          ) : <button type="button" style={btn(true, busy)} disabled={busy} onClick={makeInvite}>Create invite link</button>}
          <button type="button" style={btn()} disabled={busy} onClick={toggleClaims}>{data.claimsOpen ? 'Close team claiming' : 'Open team claiming'}</button>
          <div style={small}>Team claiming is currently {data.claimsOpen ? 'open' : 'closed'}.</div>
        </div>
      ) : null}
      <Err msg={err} />
    </div>
  );
}

/* ----------------------------------- rules ----------------------------------- */

const WEEK_OPTIONS = [24, 48, 72, 96, 120, 168];
const hoursLabel = (h: number) => (h % 24 === 0 ? `${h / 24} day${h === 24 ? '' : 's'}` : `${h} hours`);

function Rules() {
  const [data, setData] = useState<any>(null);
  const [text, setText] = useState('');
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(() => api('/api/community/rules').then((r) => { setData(r); setText(r.body || ''); }).catch((e) => setErr(e.message)), []);
  useEffect(() => { load(); }, [load]);

  async function save() {
    setBusy(true); setErr(null);
    try { await api('/api/community/rules', 'PUT', { body: text }); setEditing(false); await load(); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }
  async function setWeek(h: number) {
    setErr(null);
    try { await api(`/api/dynasties/${data.dynastyId}`, 'PATCH', { week_length_hours: h }); await load(); }
    catch (e: any) { setErr(e.message); }
  }

  if (!data) return <div className="card" style={small}>{err || 'Loading…'}</div>;
  const ts = data.teamSelection;
  const pool = ts?.pool || {};

  return (
    <div className="stack-sm">
      <div className="card">
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Length of each in-game week</div>
        {data.canEdit ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {WEEK_OPTIONS.map((h) => (
              <button key={h} type="button" onClick={() => setWeek(h)}
                style={{ ...btn(data.weekLengthHours === h), padding: '8px 12px' }}>{hoursLabel(h)}</button>
            ))}
          </div>
        ) : <div style={{ fontSize: 15 }}>{data.weekLengthHours ? hoursLabel(data.weekLengthHours) : 'Not set yet'}</div>}
        <div style={{ ...small, marginTop: 6 }}>The countdown starts when the commissioner advances to a new week. The commissioner can advance early once everyone has played.</div>
      </div>

      {ts ? (
        <div className="card">
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Team selection</div>
          <div style={{ fontSize: 13, lineHeight: 1.6 }}>
            Claiming is {ts.claimsOpen ? 'open' : 'closed'}. {ts.allowPick ? 'Coaches can pick their team. ' : ''}{ts.allowRandom ? `Random draw is allowed${ts.rerollLimit ? ` (${ts.rerollLimit} reroll${ts.rerollLimit === 1 ? '' : 's'})` : ''}. ` : ''}
            {(pool.conferences || []).length ? `Limited to: ${pool.conferences.join(', ')}. ` : ''}
            {pool.min_overall != null || pool.max_overall != null ? `Team overall ${pool.min_overall ?? 'any'}–${pool.max_overall ?? 'any'}. ` : ''}
            One team per coach, one coach per team.
          </div>
        </div>
      ) : null}

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>League rules</div>
          {data.canEdit && !editing ? <button type="button" style={{ ...btn(), padding: '6px 12px' }} onClick={() => setEditing(true)}>Edit</button> : null}
        </div>
        {editing ? (
          <>
            <textarea className="gate-input" rows={12} maxLength={6000} value={text} onChange={(e) => setText(e.target.value)} placeholder="Write the league rules here…" style={{ resize: 'vertical' }} />
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button type="button" style={btn(true, busy)} disabled={busy} onClick={save}>Save rules</button>
              <button type="button" style={btn()} onClick={() => { setEditing(false); setText(data.body || ''); }}>Cancel</button>
            </div>
          </>
        ) : data.body ? (
          <div style={{ fontSize: 14, lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{data.body}</div>
        ) : <div style={small}>{data.canEdit ? 'No rules written yet. Tap Edit to add them.' : 'The commissioner has not posted rules yet.'}</div>}
      </div>
      <Err msg={err} />
    </div>
  );
}

/* ------------------------------- message board ------------------------------- */

function ThreadView({ id, onBack, inline }: { id: string; onBack?: () => void; inline?: boolean }) {
  const [data, setData] = useState<any>(null);
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(() => api(`/api/community/threads/${id}`).then(setData).catch((e) => setErr(e.message)), [id]);
  useEffect(() => { load(); }, [load]);

  async function post(action: string, extra: any = {}) {
    setBusy(true); setErr(null);
    try { await api(`/api/community/threads/${id}`, 'POST', { action, ...extra }); if (action === 'delete_thread') { onBack?.(); return; } setReply(''); await load(); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }

  if (!data) return <div className="card" style={small}>{err || 'Loading…'}</div>;
  return (
    <div className="stack-sm">
      {!inline && onBack ? <button type="button" style={{ ...btn(), alignSelf: 'flex-start' }} onClick={onBack}>← All threads</button> : null}
      {!inline ? (
        <div className="card">
          <div style={{ fontSize: 16, fontWeight: 700 }}>{data.thread.pinned ? '📌 ' : ''}{data.thread.title}</div>
          {data.isCommish && data.thread.kind !== 'user_game' ? (
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button type="button" style={{ ...btn(), padding: '6px 12px' }} onClick={() => post('pin', { pinned: !data.thread.pinned })}>{data.thread.pinned ? 'Unpin' : 'Pin'}</button>
              <button type="button" style={{ ...btn(), padding: '6px 12px', color: '#b00020' }} onClick={() => confirm('Delete this thread?') && post('delete_thread')}>Delete thread</button>
            </div>
          ) : null}
        </div>
      ) : null}
      {data.posts.map((p: any) => (
        <div className="card" key={p.id} style={p.system ? { background: 'rgba(0,0,0,0.04)' } : undefined}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            {p.team ? <Badge text={p.team} size={22} logoUrl={p.logo} /> : null}
            <span style={{ fontWeight: 700, fontSize: 13 }}>{p.author}</span>
            {p.team ? <span style={small}>{p.team}</span> : null}
            <span style={{ ...small, marginLeft: 'auto' }}>{ago(p.createdAt)}</span>
          </div>
          <div style={{ fontSize: 14, lineHeight: 1.5, whiteSpace: 'pre-wrap', fontStyle: p.system ? 'italic' : 'normal' }}>{p.body}</div>
          {(p.mine || data.isCommish) && !p.system ? (
            <button type="button" style={{ ...btn(), padding: '4px 10px', fontSize: 12, marginTop: 8, color: '#b00020' }} onClick={() => post('delete_post', { postId: p.id })}>Delete</button>
          ) : null}
        </div>
      ))}
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <textarea className="gate-input" rows={3} maxLength={4000} value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Write a reply…" style={{ resize: 'vertical' }} />
        <button type="button" style={btn(true, busy || !reply.trim())} disabled={busy || !reply.trim()} onClick={() => post('reply', { body: reply })}>Reply</button>
      </div>
      <Err msg={err} />
    </div>
  );
}

function Board() {
  const [data, setData] = useState<any>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [announce, setAnnounce] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(() => api('/api/community/threads').then(setData).catch((e) => setErr(e.message)), []);
  useEffect(() => { load(); }, [load]);

  async function create() {
    setBusy(true); setErr(null);
    try {
      const r = await api('/api/community/threads', 'POST', { title, body, kind: announce ? 'announcement' : 'general' });
      setComposing(false); setTitle(''); setBody(''); setAnnounce(false); await load(); setOpen(r.id);
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }

  if (open) return <ThreadView id={open} onBack={() => { setOpen(null); load(); }} />;
  if (!data) return <div className="card" style={small}>{err || 'Loading…'}</div>;

  return (
    <div className="stack-sm">
      {composing ? (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <input className="gate-input" placeholder="Title" maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} />
          <textarea className="gate-input" rows={4} maxLength={4000} placeholder="What do you want to say?" value={body} onChange={(e) => setBody(e.target.value)} style={{ resize: 'vertical' }} />
          {data.isCommish ? <label className="gate-check"><input type="checkbox" checked={announce} onChange={(e) => setAnnounce(e.target.checked)} /> Post as an announcement (pinned)</label> : null}
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" style={btn(true, busy || title.trim().length < 2 || !body.trim())} disabled={busy || title.trim().length < 2 || !body.trim()} onClick={create}>Post</button>
            <button type="button" style={btn()} onClick={() => setComposing(false)}>Cancel</button>
          </div>
        </div>
      ) : <button type="button" style={btn(true)} onClick={() => setComposing(true)}>New thread</button>}

      {data.threads.length === 0 ? <div className="card" style={small}>No threads yet. Start the conversation.</div> : null}
      {data.threads.map((t: any) => (
        <button key={t.id} type="button" className="card" onClick={() => setOpen(t.id)} style={{ textAlign: 'left', width: '100%', cursor: 'pointer', font: 'inherit' }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>
            {t.pinned ? '📌 ' : ''}{t.kind === 'announcement' ? '📣 ' : t.kind === 'user_game' ? '🏈 ' : ''}{t.title}
          </div>
          <div style={small}>{t.author} · {t.posts} post{t.posts === 1 ? '' : 's'} · {ago(t.lastActivity)}</div>
        </button>
      ))}
      <Err msg={err} />
    </div>
  );
}

/* ----------------------------- scheduling assistant ----------------------------- */

function useCountdown(iso: string | null) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(t); }, []);
  if (!iso) return null;
  const ms = new Date(iso).getTime() - now;
  if (ms <= 0) return { done: true, text: 'Time is up' };
  const days = Math.floor(ms / 86400000), h = Math.floor((ms % 86400000) / 3600000), m = Math.floor((ms % 3600000) / 60000);
  return { done: false, text: days > 0 ? `${days}d ${h}h ${m}m` : `${h}h ${m}m` };
}

const STATUS_LABEL: Record<string, string> = { unscheduled: 'Not scheduled', scheduled: 'Scheduled', played: 'Played', simmed: 'Simmed', forfeit: 'Forfeit' };

function ScheduleAssistant() {
  const [data, setData] = useState<any>(null);
  const [openChat, setOpenChat] = useState<string | null>(null);
  const [forfeitFor, setForfeitFor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(() => api('/api/community/schedule').then(setData).catch((e) => setErr(e.message)), []);
  useEffect(() => { load(); }, [load]);
  const cd = useCountdown(data?.countdownEndsAt ?? null);

  async function act(gameId: string, action: string, extra: any = {}) {
    setBusy(true); setErr(null);
    try { await api('/api/community/schedule', 'POST', { gameId, action, ...extra }); setForfeitFor(null); await load(); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }

  if (!data) return <div className="card" style={small}>{err || 'Loading…'}</div>;

  return (
    <div className="stack-sm">
      <div className="card" style={{ textAlign: 'center' }}>
        <div style={small}>Countdown to advance</div>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 38, color: cd?.done ? '#b00020' : 'var(--primary)', lineHeight: 1.1, margin: '4px 0' }}>
          {cd ? cd.text : '—'}
        </div>
        <div style={small}>
          {data.liveWeek === null ? 'Nothing is live yet.' : cd ? `${weekLabel(data.liveWeek)} · the commissioner advances when it ends or once everyone has played.` : `${weekLabel(data.liveWeek)} · no countdown set.`}
        </div>
      </div>

      <div style={{ fontSize: 13, fontWeight: 600, padding: '4px 2px' }}>Coach vs. coach this week</div>
      {data.games.length === 0 ? <div className="card" style={small}>{data.liveWeek === null ? 'Games show up once a week is live.' : 'No two coaches in this dynasty play each other this week.'}</div> : null}

      {data.games.map((g: any) => {
        const mine = g.a.userId === data.me || g.b.userId === data.me;
        const done = g.status === 'played' || g.status === 'simmed' || g.status === 'forfeit';
        return (
          <div className="card" key={g.id} style={mine ? { border: '2px solid var(--primary)' } : undefined}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Badge text={g.a.team} size={36} logoUrl={g.a.logo} />
              <div style={{ flex: 1, textAlign: 'center', fontSize: 13 }}>
                <div style={{ fontWeight: 700 }}>{g.a.team} vs {g.b.team}</div>
                <div style={small}>{g.a.name} · {g.b.name}</div>
              </div>
              <Badge text={g.b.team} size={36} logoUrl={g.b.logo} />
            </div>
            <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 999, background: done ? '#e2f3e7' : g.status === 'scheduled' ? '#fff3d6' : '#fbe6e6', color: done ? '#1b7a3a' : g.status === 'scheduled' ? '#8a6100' : '#b00020' }}>
                {STATUS_LABEL[g.status] || g.status}{g.status === 'forfeit' && g.winner ? ` · ${g.winner} wins` : ''}
              </span>
              <button type="button" style={{ ...btn(), padding: '5px 10px', fontSize: 12 }} onClick={() => setOpenChat(openChat === g.id ? null : g.id)}>{openChat === g.id ? 'Hide chat' : 'Find a time'}</button>
              {mine && !done ? <button type="button" style={{ ...btn(), padding: '5px 10px', fontSize: 12 }} disabled={busy} onClick={() => act(g.id, 'agree_sim')}>Agree to sim</button> : null}
            </div>
            {openChat === g.id && g.threadId ? <div style={{ marginTop: 10 }}><ThreadView id={g.threadId} inline /></div> : null}

            {data.isCommish ? (
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid rgba(0,0,0,0.08)' }}>
                <div style={{ ...small, marginBottom: 6 }}>Commissioner</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {(['scheduled', 'played', 'simmed'] as const).map((s) => (
                    <button key={s} type="button" disabled={busy} style={{ ...btn(g.status === s), padding: '6px 10px', fontSize: 12 }} onClick={() => act(g.id, s)}>{STATUS_LABEL[s]}</button>
                  ))}
                  <button type="button" disabled={busy} style={{ ...btn(g.status === 'forfeit'), padding: '6px 10px', fontSize: 12 }} onClick={() => setForfeitFor(forfeitFor === g.id ? null : g.id)}>Force win…</button>
                  {g.status !== 'unscheduled' ? <button type="button" disabled={busy} style={{ ...btn(), padding: '6px 10px', fontSize: 12 }} onClick={() => act(g.id, 'unscheduled')}>Reset</button> : null}
                </div>
                {forfeitFor === g.id ? (
                  <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                    {[g.a, g.b].map((t: any) => (
                      <button key={t.team} type="button" disabled={busy} style={{ ...btn(), padding: '6px 10px', fontSize: 12, flex: 1 }} onClick={() => act(g.id, 'forfeit', { winner: t.team })}>{t.team} wins</button>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        );
      })}
      <Err msg={err} />
    </div>
  );
}

/* ------------------------------------ tab ------------------------------------ */

export default function Community({ d, subtab }: { d: DashboardData; subtab: string | null }) {
  switch (subtab) {
    case 'rules': return <Rules />;
    case 'schedule': return <ScheduleAssistant />;
    case 'board': return <Board />;
    case 'uploads': return <Upload />;
    case 'users':
    default: return <Users d={d} />;
  }
}
