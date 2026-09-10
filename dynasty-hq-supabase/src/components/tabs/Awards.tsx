import type { DashboardData } from '@/lib/types';
import { isMine as isMineFn, logoFor } from '@/lib/format';
import { Row } from '@/components/shared/Row';
import Badge from '@/components/shared/Badge';
import EmptyState from '@/components/shared/EmptyState';

// Coordinator/Coach awards (Broyles/Coach of the Year) were dropped — those
// tables no longer exist. This is Heisman-only now.
export default function Awards({ d }: { d: DashboardData }) {
  const list = (d.awards && d.awards.heisman) || [];
  const myTeamName = d.team && d.team.TEAM_NAME;
  if (!list.length) return <EmptyState>No Heisman race data yet.</EmptyState>;
  const cols = '22px 26px 1fr 36px';
  return (
    <div className="table primary">
      {list.map((p, i) => (
        <Row key={i} cols={cols} first={i === 0} mine={isMineFn(myTeamName, p.team)}>
          <div className="tabular" style={{ fontWeight: 700, color: 'rgba(0,0,0,0.45)', fontSize: 12 }}>
            {p.rank}
          </div>
          <Badge text={p.team} size={24} mine={isMineFn(myTeamName, p.team)} logoUrl={logoFor(d.assets, p.team)} />
          <div className="truncate">
            <span style={{ fontWeight: 600, fontSize: 14 }}>{p.name}</span>
            <span style={{ color: 'rgba(0,0,0,0.45)', fontSize: 12 }}> · {p.team}</span>
          </div>
          <div className="right" style={{ fontSize: 12, fontWeight: 600, color: 'rgba(0,0,0,0.55)' }}>
            {p.pos}
          </div>
        </Row>
      ))}
    </div>
  );
}
