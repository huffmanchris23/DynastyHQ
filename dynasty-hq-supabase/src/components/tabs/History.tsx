'use client';

import { useEffect, useState } from 'react';
import type { DashboardData } from '@/lib/types';
import { logoFor } from '@/lib/format';
import Badge from '@/components/shared/Badge';
import EmptyState from '@/components/shared/EmptyState';
import SectionLabel from '@/components/shared/SectionLabel';

const small: React.CSSProperties = { fontSize: 12, color: 'rgba(0,0,0,0.55)' };

function useHistory() {
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    fetch('/api/history').then(async (r) => { const b = await r.json(); if (!r.ok) throw new Error(b.error || 'Could not load history'); setData(b); }).catch((e) => setErr(e.message));
  }, []);
  return { data, err };
}

function Champions({ d, h }: { d: DashboardData; h: any }) {
  const rows = (h.champions || []).filter((s: any) => s.champion_team);
  if (!rows.length) return <EmptyState>No champions recorded yet. Your commissioner adds each season&rsquo;s champion in History Upload once the season ends.</EmptyState>;
  const titles = new Map<string, number>();
  rows.forEach((s: any) => titles.set(s.champion_team, (titles.get(s.champion_team) || 0) + 1));
  const tally = Array.from(titles.entries()).sort((a, b) => b[1] - a[1]);
  return (
    <div className="stack-sm">
      <SectionLabel>National Champions</SectionLabel>
      {rows.map((s: any) => (
        <div className="card" key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Badge text={s.champion_team} size={44} logoUrl={logoFor(d.assets, s.champion_team)} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={small}>Season {s.season}</div>
            <div style={{ fontWeight: 700, fontSize: 16 }}>{s.champion_team}</div>
            {s.championCoach ? <div style={{ fontSize: 13 }}>Coach {s.championCoach}</div> : null}
            {s.runner_up_team ? <div style={small}>Beat {s.runner_up_team}{s.title_score ? `, ${s.title_score}` : ''}</div> : null}
          </div>
        </div>
      ))}
      {tally.length > 1 || (tally[0] && tally[0][1] > 1) ? (
        <>
          <SectionLabel>Titles</SectionLabel>
          <div className="card">
            {tally.map(([team, n], i) => (
              <div key={team} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderTop: i ? '1px solid rgba(0,0,0,0.06)' : 'none' }}>
                <Badge text={team} size={22} logoUrl={logoFor(d.assets, team)} />
                <div style={{ flex: 1, fontSize: 14 }}>{team}</div>
                <div style={{ fontWeight: 700 }}>{n}</div>
              </div>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}

function HeadToHead({ h }: { h: any }) {
  const [open, setOpen] = useState<string | null>(null);
  if (!h.h2h.length) return <EmptyState>No coach-vs-coach results yet. When your commissioner records a winner in the Scheduling Assistant, it counts here.</EmptyState>;
  return (
    <div className="stack-sm">
      <SectionLabel>Coach vs. Coach Record</SectionLabel>
      <div className="card">
        {h.standings.map((s: any, i: number) => (
          <div key={s.userId} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderTop: i ? '1px solid rgba(0,0,0,0.06)' : 'none', fontWeight: s.userId === h.me ? 700 : 400 }}>
            <Badge text={s.team || s.name} size={22} logoUrl={s.logo || undefined} />
            <div style={{ flex: 1, fontSize: 14 }}>{s.name}</div>
            <div className="tabular" style={{ fontSize: 14 }}>{s.wins}-{s.losses}</div>
          </div>
        ))}
      </div>

      <SectionLabel>Head-to-Head</SectionLabel>
      {h.h2h.map((p: any) => {
        const key = `${p.aId}|${p.bId}`;
        const aLeads = p.aWins > p.bWins, bLeads = p.bWins > p.aWins;
        const streakName = p.streak.userId === p.aId ? p.aName : p.bName;
        return (
          <div className="card" key={key} style={{ cursor: 'pointer' }} onClick={() => setOpen(open === key ? null : key)}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: 8 }}>
              <div style={{ textAlign: 'center' }}>
                <Badge text={p.aTeam || p.aName} size={36} logoUrl={p.aLogo || undefined} />
                <div style={{ fontSize: 13, fontWeight: 600, marginTop: 2 }}>{p.aName}</div>
              </div>
              <div className="tabular" style={{ fontFamily: 'var(--font-display)', fontSize: 28, textAlign: 'center' }}>
                <span style={{ opacity: aLeads ? 1 : 0.55 }}>{p.aWins}</span>
                <span style={{ opacity: 0.4 }}> - </span>
                <span style={{ opacity: bLeads ? 1 : 0.55 }}>{p.bWins}</span>
              </div>
              <div style={{ textAlign: 'center' }}>
                <Badge text={p.bTeam || p.bName} size={36} logoUrl={p.bLogo || undefined} />
                <div style={{ fontSize: 13, fontWeight: 600, marginTop: 2 }}>{p.bName}</div>
              </div>
            </div>
            <div style={{ ...small, textAlign: 'center', marginTop: 6 }}>
              {p.aWins === p.bWins ? 'Series tied' : `${aLeads ? p.aName : p.bName} leads the series`}
              {p.streak.count > 1 ? ` · ${streakName} has won ${p.streak.count} straight` : ''}
            </div>
            {open === key ? (
              <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid rgba(0,0,0,0.08)' }}>
                {p.games.map((g: any, i: number) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 13, padding: '3px 0' }}>
                    <span>Season {g.season}, Week {g.week}: {g.teamA} vs {g.teamB}</span>
                    <span style={{ fontWeight: 600 }}>{g.winnerTeam} won{g.status === 'forfeit' ? ' (forced)' : g.status === 'simmed' ? ' (sim)' : ''}</span>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function AwardsHistory({ d, h }: { d: DashboardData; h: any }) {
  const bySeason = new Map<number, any[]>();
  (h.awards || []).forEach((a: any) => bySeason.set(a.season, [...(bySeason.get(a.season) || []), a]));
  const seasons = Array.from(bySeason.keys()).sort((a, b) => b - a);
  if (!seasons.length) return <EmptyState>No awards recorded yet. They are added in History Upload at the end of each season.</EmptyState>;
  return (
    <div className="stack-sm">
      {seasons.map((s) => (
        <div key={s}>
          <SectionLabel>{`Season ${s}`}</SectionLabel>
          <div className="card">
            {bySeason.get(s)!.map((a: any, i: number) => (
              <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderTop: i ? '1px solid rgba(0,0,0,0.06)' : 'none' }}>
                {a.winner_team ? <Badge text={a.winner_team} size={28} logoUrl={logoFor(d.assets, a.winner_team)} /> : null}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={small}>{a.award}</div>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{a.winner_name || a.winner_team}</div>
                  {a.winner_name && a.winner_team ? <div style={small}>{a.winner_team}{a.detail ? ` · ${a.detail}` : ''}</div> : a.detail ? <div style={small}>{a.detail}</div> : null}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function History({ d, subtab }: { d: DashboardData; subtab: string | null }) {
  const { data, err } = useHistory();
  if (err) return <div className="card" style={{ color: '#b00020', fontSize: 13 }}>{err}</div>;
  if (!data) return <div className="card" style={small}>Loading…</div>;
  if (subtab === 'h2h' && data.mode === 'multi') return <HeadToHead h={data} />;
  if (subtab === 'awards') return <AwardsHistory d={d} h={data} />;
  return <Champions d={d} h={data} />;
}
