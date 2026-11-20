'use client';

import { useState } from 'react';
import type { DashboardData } from '@/lib/types';
import { numOr, isMine as isMineFn, logoFor } from '@/lib/format';
import { Row, Thead } from '@/components/shared/Row';
import Badge from '@/components/shared/Badge';
import SectionLabel from '@/components/shared/SectionLabel';
import EmptyState from '@/components/shared/EmptyState';

/**
 * Team Stats, split offense/defense via team_stats.offense_or_defense_stat.
 * Player-level (passing/rushing/receiving) stats were dropped — those
 * tables no longer exist in the schema.
 */
export function TeamStats({ d, kind }: { d: DashboardData; kind: 'offense' | 'defense' }) {
  const split = (d.teamStats && d.teamStats[kind]) || { national: [], mine: null };
  const mine = split.mine || ({} as NonNullable<typeof split.mine>);
  const myTeamName = d.team && d.team.TEAM_NAME;
  const isDefense = kind === 'defense';
  const cards = [
    { label: isDefense ? 'Points Allowed/Game' : 'Points/Game', value: mine.ppg },
    { label: isDefense ? 'Yards Allowed/Game' : 'Yards/Game', value: mine.ypg },
    { label: isDefense ? 'Pass Yds Allowed/Game' : 'Pass Yds/Game', value: mine.passYpg },
    { label: isDefense ? 'Rush Yds Allowed/Game' : 'Rush Yds/Game', value: mine.rushYpg },
  ];
  // Only the top 5 nationally, per the OCR workflow (screenshot covers the
  // top group + a separate one for our team if it falls outside that group).
  const national = (split.national || []).slice(0, 5);
  const cols = '26px 1fr 46px 46px 56px 56px';

  return (
    <>
      <div>
        <SectionLabel>{(d.team && d.team.TEAM_NAME) + ` — Season ${isDefense ? 'Defense' : 'Offense'}`}</SectionLabel>
        <div className="grid-2">
          {cards.map((c, i) => (
            <div className="card" key={i}>
              <div className="stat-label">{c.label}</div>
              <div className="stat-value">{numOr(c.value)}</div>
            </div>
          ))}
        </div>
      </div>
      <div style={{ marginTop: 16 }}>
        <SectionLabel>{`National — Team ${isDefense ? 'Defense' : 'Offense'}`}</SectionLabel>
        <div className="table primary">
          <Thead cols={cols}>
            <div style={{ textAlign: 'left' }}>Rk</div>
            <div style={{ textAlign: 'left' }}>Team</div>
            <div>Pts/G</div>
            <div>Yds/G</div>
            <div>Pass/G</div>
            <div>Rush/G</div>
          </Thead>
          {national.length ? (
            national.map((r, i) => (
              <Row key={i} cols={cols} first={i === 0} mine={isMineFn(myTeamName, r.team)}>
                <div className="tabular" style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)' }}>
                  {r.rank}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, overflow: 'hidden' }}>
                  <Badge text={r.team} size={20} mine={isMineFn(myTeamName, r.team)} logoUrl={logoFor(d.assets, r.team)} />
                  <span className="truncate" style={{ fontWeight: 500 }}>
                    {r.team}
                  </span>
                </div>
                <div className="right tabular" style={{ fontSize: 12, color: 'rgba(0,0,0,0.7)' }}>
                  {numOr(r.ppg)}
                </div>
                <div className="right tabular" style={{ fontSize: 12, color: 'rgba(0,0,0,0.7)' }}>
                  {numOr(r.ypg)}
                </div>
                <div className="right tabular" style={{ fontSize: 12, color: 'rgba(0,0,0,0.7)' }}>
                  {numOr(r.passYpg)}
                </div>
                <div className="right tabular" style={{ fontSize: 12, color: 'rgba(0,0,0,0.7)' }}>
                  {numOr(r.rushYpg)}
                </div>
              </Row>
            ))
          ) : (
            <EmptyState>No national data yet.</EmptyState>
          )}
        </div>
      </div>
    </>
  );
}

/* ============================== DYNASTY STATS ============================== */
/* Multi-user dynasties only: every coach's team side by side, plus a head-to-head picker. */

type StatKey = 'ppg' | 'ypg' | 'passYpg' | 'rushYpg';
const STATS: { key: StatKey; short: string; off: string; def: string }[] = [
  { key: 'ppg', short: 'Pts/G', off: 'Points/Game', def: 'Points Allowed/Game' },
  { key: 'ypg', short: 'Yds/G', off: 'Yards/Game', def: 'Yards Allowed/Game' },
  { key: 'passYpg', short: 'Pass/G', off: 'Pass Yds/Game', def: 'Pass Yds Allowed/Game' },
  { key: 'rushYpg', short: 'Rush/G', off: 'Rush Yds/Game', def: 'Rush Yds Allowed/Game' },
];

function statNum(v: any): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

const selectStyle: React.CSSProperties = {
  flex: 1, minWidth: 0, padding: '10px 8px', borderRadius: 8, fontSize: 14,
  border: '1px solid rgba(0,0,0,0.18)', background: 'transparent', color: 'inherit',
};

/** Coach first name for the dynasty tables; if the coach has no name yet (we show their team), keep the team. */
const firstName = (r: { name: string; team: string }) => (r.name && r.name !== r.team ? r.name.trim().split(/\s+/)[0] : r.team);

export function DynastyStats({ d, kind }: { d: DashboardData; kind: 'offense' | 'defense' }) {
  const isDefense = kind === 'defense';
  const rows = (d.dynastyStats && d.dynastyStats[kind]) || [];
  const [aId, setAId] = useState<string | null>(null);
  const [bId, setBId] = useState<string | null>(null);

  const me = rows.find((r) => r.isMe) || null;
  // Dynasty teams only, ranked by yards per game. Offense: bigger is better.
  // Defense: these are yards ALLOWED, so smaller is better. Teams that haven't
  // uploaded yet (no yardage) sort to the bottom.
  const sortKey: StatKey = 'ypg';
  const sorted = [...rows].sort((a, b) => {
    const av = statNum(a[sortKey]);
    const bv = statNum(b[sortKey]);
    if (av === null && bv === null) return String(a.team).localeCompare(String(b.team));
    if (av === null) return 1;
    if (bv === null) return -1;
    return isDefense ? av - bv : bv - av;
  });

  const aRow = rows.find((r) => r.userId === aId) || me || rows[0] || null;
  const bRow = rows.find((r) => r.userId === bId && r.userId !== aRow?.userId) || rows.find((r) => r.userId !== aRow?.userId) || null;

  const cols = '24px 1fr 50px 50px 52px 52px';
  const muted = { fontSize: 12, color: 'rgba(0,0,0,0.7)' } as const;

  return (
    <>
      <div>
        <SectionLabel>{`Dynasty — Team ${isDefense ? 'Defense' : 'Offense'}`}</SectionLabel>
        <div className="table primary">
          <Thead cols={cols}>
            <div style={{ textAlign: 'left' }}>Rk</div>
            <div style={{ textAlign: 'left' }}>Coach</div>
            {STATS.map((st) => (<div key={st.key}>{st.short}</div>))}
          </Thead>
          {sorted.length ? (
            sorted.map((r, i) => (
              <Row key={r.userId} cols={cols} first={i === 0} mine={r.isMe}>
                <div className="tabular" style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)' }}>{statNum(r[sortKey]) === null ? '–' : i + 1}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, overflow: 'hidden' }}>
                  <Badge text={r.team} size={20} mine={r.isMe} logoUrl={logoFor(d.assets, r.team)} />
                  <div style={{ overflow: 'hidden' }}>
                    <div className="truncate" style={{ fontWeight: 500 }}>{firstName(r)}</div>
                    <div className="truncate" style={{ fontSize: 11, color: 'rgba(0,0,0,0.5)' }}>{r.team}</div>
                  </div>
                </div>
                {STATS.map((st) => (<div key={st.key} className="right tabular" style={muted}>{numOr(r[st.key])}</div>))}
              </Row>
            ))
          ) : (
            <EmptyState>No coaches in this dynasty yet.</EmptyState>
          )}
        </div>
      </div>

      {rows.length >= 2 && aRow && bRow ? (
        <div style={{ marginTop: 16 }}>
          <SectionLabel>Compare Coaches</SectionLabel>
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <select aria-label="First coach" value={aRow.userId} onChange={(e) => setAId(e.target.value)} style={selectStyle}>
                {rows.map((r) => (<option key={r.userId} value={r.userId}>{firstName(r)} · {r.team}</option>))}
              </select>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'rgba(0,0,0,0.45)' }}>vs</span>
              <select aria-label="Second coach" value={bRow.userId} onChange={(e) => setBId(e.target.value)} style={selectStyle}>
                {rows.filter((r) => r.userId !== aRow.userId).map((r) => (<option key={r.userId} value={r.userId}>{firstName(r)} · {r.team}</option>))}
              </select>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: '8px 12px', alignItems: 'center' }}>
              {STATS.map((st) => {
                const av = statNum(aRow[st.key]);
                const bv = statNum(bRow[st.key]);
                const aBetter = av !== null && bv !== null && av !== bv && (isDefense ? av < bv : av > bv);
                const bBetter = av !== null && bv !== null && av !== bv && (isDefense ? bv < av : bv > av);
                const cell = (better: boolean): React.CSSProperties => ({
                  textAlign: 'center', fontSize: 18, fontVariantNumeric: 'tabular-nums',
                  fontWeight: better ? 800 : 500, color: better ? 'var(--primary)' : 'rgba(0,0,0,0.7)',
                });
                return (
                  <div key={st.key} style={{ display: 'contents' }}>
                    <div style={cell(aBetter)}>{numOr(aRow[st.key])}</div>
                    <div style={{ fontSize: 11, textAlign: 'center', color: 'rgba(0,0,0,0.5)', minWidth: 84 }}>{isDefense ? st.def : st.off}</div>
                    <div style={cell(bBetter)}>{numOr(bRow[st.key])}</div>
                  </div>
                );
              })}
            </div>
            <div style={{ fontSize: 11, color: 'rgba(0,0,0,0.5)', textAlign: 'center' }}>
              {isDefense ? 'Lower is better on defense.' : 'Higher is better on offense.'}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
