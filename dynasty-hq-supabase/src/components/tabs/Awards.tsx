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
  const cols = '28px 34px 1fr 42px';
  return (
    <div className="table primary">
      {list.map((p, i) => (
        <Row key={i} cols={cols} first={i === 0} mine={isMineFn(myTeamName, p.team)}>
          <div className="tabular" style={{ fontWeight: 700, color: 'rgba(0,0,0,0.45)', fontSize: 12 }}>
            {p.rank}
          </div>
          <div style={{ paddingRight: 6 }}>
            <Badge text={p.team} size={24} mine={isMineFn(myTeamName, p.team)} logoUrl={logoFor(d.assets, p.team)} />
          </div>
          <div className="truncate" style={{ paddingLeft: 4 }}>
            <div style={{ fontWeight: 600, fontSize: 14 }}>{p.name}</div>
            <div style={{ color: 'rgba(0,0,0,0.45)', fontSize: 12, marginTop: 1 }}>{p.team}</div>
          </div>
          <div className="right" style={{ fontSize: 12, fontWeight: 600, color: 'rgba(0,0,0,0.55)' }}>
            {p.pos}
          </div>
        </Row>
      ))}
    </div>
  );
}
