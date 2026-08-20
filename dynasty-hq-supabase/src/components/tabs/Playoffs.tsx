import type { DashboardData } from '@/lib/types';
import { numOr, isMine as isMineFn, logoFor } from '@/lib/format';
import { Row, Thead } from '@/components/shared/Row';
import Badge from '@/components/shared/Badge';
import SectionLabel from '@/components/shared/SectionLabel';
import EmptyState from '@/components/shared/EmptyState';

export function PlayoffRankings({ d }: { d: DashboardData }) {
  const seeds = (d.playoff && d.playoff.seeds) || [];
  const myTeamName = d.team && d.team.TEAM_NAME;
  if (!seeds.length) return <EmptyState>Playoff rankings not posted yet.</EmptyState>;
  const cols = '30px 1fr 60px';
  return (
    <div className="table primary">
      <Thead cols={cols}>
        <div style={{ textAlign: 'left' }}>Rank</div>
        <div style={{ textAlign: 'left' }}>Team</div>
        <div>Overall</div>
      </Thead>
      {seeds.map((s, i) => (
        <Row key={i} cols={cols} first={i === 0} mine={isMineFn(myTeamName, s.team)}>
          <div className="tabular" style={{ fontWeight: 700, color: 'rgba(255,255,255,0.6)', fontSize: 12 }}>
            {s.rank}
          </div>
          <div className="truncate" style={{ fontWeight: 500, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Badge text={s.team} size={20} mine={isMineFn(myTeamName, s.team)} logoUrl={logoFor(d.assets, s.team)} />
            <span className="truncate">{s.team}</span>
          </div>
          <div className="right tabular" style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>
            {numOr(s.wins, '')}-{numOr(s.losses, '')}
          </div>
        </Row>
      ))}
    </div>
  );
}

export function Bracket({ d }: { d: DashboardData }) {
  if (!d.playoffBracketUrl) return <EmptyState>Bracket not posted yet.</EmptyState>;
  return (
    <>
      <SectionLabel>CFP Bracket</SectionLabel>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={d.playoffBracketUrl}
        alt="CFP Bracket"
        style={{ width: '100%', borderRadius: 4, border: '1px solid color-mix(in srgb, var(--primary) 60%, transparent)' }}
      />
    </>
  );
}
