'use client';

import { useMemo } from 'react';
import type { DashboardData } from '@/lib/types';
import { isMine as isMineFn, logoFor, rankedName } from '@/lib/format';
import { Row, Thead } from '@/components/shared/Row';
import Badge from '@/components/shared/Badge';
import EmptyState from '@/components/shared/EmptyState';

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

  const defaultConf = conferences.find((c) => String(c).toLowerCase() === String(myConference || '').toLowerCase()) || conferences[0] || '';
  const activeConf = defaultConf;

  if (!allRows.length) return <EmptyState>No conference data yet.</EmptyState>;

  const rows = allRows.filter((r) => r.conference === activeConf);
  const cols = '1fr 60px 60px';

  return (
    <>
      <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        {d.settings.conferenceLogoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={d.settings.conferenceLogoUrl} alt={activeConf} style={{ width: 40, height: 40, objectFit: 'contain', flexShrink: 0 }} />
        ) : (
          <Badge text={activeConf} size={40} mine />
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="stat-label">Conference</div>
          <div style={{ fontSize: 17, fontWeight: 700 }}>{activeConf}</div>
        </div>
      </div>
      <div className="table primary">
        <Thead cols={cols}>
          <div style={{ textAlign: 'left' }}>Team</div>
          <div>Conf</div>
          <div>Ovr</div>
        </Thead>
        {rows.map((c, i) => (
          <Row key={i} cols={cols} first={i === 0} mine={isMineFn(myTeamName, c.team)}>
            <div className="truncate" style={{ fontWeight: 500, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Badge text={c.team} size={20} mine={isMineFn(myTeamName, c.team)} logoUrl={logoFor(d.assets, c.team)} />
              <span className="truncate">{rankedName(d, c.team)}</span>
            </div>
            <div className="right tabular" style={{ fontSize: 12, color: 'rgba(0,0,0,0.7)' }}>
              {c.confW ?? ''}-{c.confL ?? ''}
            </div>
            <div className="right tabular" style={{ fontSize: 12, color: 'rgba(0,0,0,0.7)' }}>
              {c.overallW ?? ''}-{c.overallL ?? ''}
            </div>
          </Row>
        ))}
      </div>
    </>
  );
}
