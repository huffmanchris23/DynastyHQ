'use client';

import { useMemo, useState } from 'react';
import type { DashboardData } from '@/lib/types';
import { numOr, isMine as isMineFn, logoFor } from '@/lib/format';
import { Row, Thead } from '@/components/shared/Row';
import Badge from '@/components/shared/Badge';
import EmptyState from '@/components/shared/EmptyState';

function toNum(v: any): number {
  const n = Number(v);
  return isNaN(n) ? 0 : n;
}

export default function Conference({ d }: { d: DashboardData }) {
  const allRows = d.conf || [];
  const myTeamName = d.team && d.team.TEAM_NAME;
  const myConference = d.team && d.team.TEAM_CONFERENCE;

  const conferences = useMemo(() => {
    const seen = new Set<string>();
    const list: string[] = [];
    allRows.forEach((r) => {
      const name = r.conference || '';
      if (name && !seen.has(name)) {
        seen.add(name);
        list.push(name);
      }
    });
    return list.sort((a, b) => a.localeCompare(b));
  }, [allRows]);

  // The frontrunner of each conference race — best conference record first,
  // then best overall record as the tiebreaker.
  const frontrunners = useMemo(() => {
    const leaderByConf = new Map<string, (typeof allRows)[number]>();
    allRows.forEach((r) => {
      const key = r.conference || '';
      if (!key) return;
      const current = leaderByConf.get(key);
      if (!current) {
        leaderByConf.set(key, r);
        return;
      }
      const rConfW = toNum(r.confW), curConfW = toNum(current.confW);
      const rConfL = toNum(r.confL), curConfL = toNum(current.confL);
      const rOvW = toNum(r.overallW), curOvW = toNum(current.overallW);
      const better =
        rConfW > curConfW ||
        (rConfW === curConfW && rConfL < curConfL) ||
        (rConfW === curConfW && rConfL === curConfL && rOvW > curOvW);
      if (better) leaderByConf.set(key, r);
    });
    return conferences.map((c) => ({ conference: c, leader: leaderByConf.get(c) }));
  }, [allRows, conferences]);

  const defaultConf = conferences.find((c) => String(c).toLowerCase() === String(myConference || '').toLowerCase()) || conferences[0] || '';
  const [selected, setSelected] = useState(defaultConf);
  const activeConf = conferences.includes(selected) ? selected : defaultConf;

  if (!allRows.length) return <EmptyState>No conference data yet.</EmptyState>;

  const rows = allRows.filter((r) => r.conference === activeConf);
  const cols = '1fr 48px 48px 42px 42px';

  return (
    <>
      {conferences.length > 1 ? (
        <div style={{ marginBottom: 12 }}>
          <div className="stat-label" style={{ marginBottom: 6 }}>
            Conference Frontrunners
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {frontrunners.map(({ conference, leader }) => (
              <button
                key={conference}
                onClick={() => setSelected(conference)}
                className="card"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '8px 10px',
                  cursor: 'pointer',
                  textAlign: 'left',
                  borderColor: conference === activeConf ? 'var(--accent)' : undefined,
                }}
              >
                {leader ? (
                  <Badge text={leader.team} size={22} mine={isMineFn(myTeamName, leader.team)} logoUrl={logoFor(d.assets, leader.team)} />
                ) : (
                  <div style={{ width: 22, height: 22 }} />
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="truncate" style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                    {conference}
                  </div>
                  <div className="truncate" style={{ fontSize: 13, fontWeight: 600 }}>
                    {leader ? leader.team : '—'}
                  </div>
                </div>
                {leader ? (
                  <div className="tabular" style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)' }}>
                    {leader.confW ?? 0}-{leader.confL ?? 0}
                  </div>
                ) : null}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <Badge text={activeConf} size={40} mine />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="stat-label">Conference</div>
          {conferences.length > 1 ? (
            <select
              value={activeConf}
              onChange={(e) => setSelected(e.target.value)}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text)',
                fontSize: 17,
                fontWeight: 700,
                padding: 0,
                width: '100%',
              }}
            >
              {conferences.map((c) => (
                <option key={c} value={c} style={{ background: 'var(--bg)', color: 'var(--text)' }}>
                  {c}
                </option>
              ))}
            </select>
          ) : (
            <div style={{ fontSize: 17, fontWeight: 700 }}>{activeConf}</div>
          )}
        </div>
      </div>
      <div className="table primary">
        <Thead cols={cols}>
          <div style={{ textAlign: 'left' }}>Team</div>
          <div>Conf</div>
          <div>Ovr</div>
          <div>PF</div>
          <div>PA</div>
        </Thead>
        {rows.map((c, i) => (
          <Row key={i} cols={cols} first={i === 0} mine={isMineFn(myTeamName, c.team)}>
            <div className="truncate" style={{ fontWeight: 500, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Badge text={c.team} size={20} mine={isMineFn(myTeamName, c.team)} logoUrl={logoFor(d.assets, c.team)} />
              <span className="truncate">{c.team}</span>
            </div>
            <div className="right tabular" style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>
              {c.confW ?? ''}-{c.confL ?? ''}
            </div>
            <div className="right tabular" style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>
              {c.overallW ?? ''}-{c.overallL ?? ''}
            </div>
            <div className="right tabular" style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>
              {numOr(c.pf, '')}
            </div>
            <div className="right tabular" style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>
              {numOr(c.pa, '')}
            </div>
          </Row>
        ))}
      </div>
    </>
  );
}
