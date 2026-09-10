import type { DashboardData } from '@/lib/types';
import { isMine as isMineFn, logoFor } from '@/lib/format';
import { Row, Thead } from '@/components/shared/Row';
import Badge from '@/components/shared/Badge';
import EmptyState from '@/components/shared/EmptyState';

export default function Rankings({ d }: { d: DashboardData }) {
  // Consolidated Top 25 — one screenshot, one list, up to 25 teams. No more
  // AP/Coaches toggle (coaches_poll was dropped), and no "last week" column
  // (top_25.last_week was dropped too — this poll isn't tracking movement).
  const list = d.rank.ap;
  const myTeamName = d.team && d.team.TEAM_NAME;
  if (!list.length) return <EmptyState>No poll data yet.</EmptyState>;
  const cols = '30px 1fr 60px';
  return (
    <div className="table primary">
      <Thead cols={cols}>
        <div style={{ textAlign: 'left' }}>Rk</div>
        <div style={{ textAlign: 'left' }}>Team</div>
        <div>W-L</div>
      </Thead>
      {list.map((r, i) => (
        <Row key={i} cols={cols} first={i === 0} mine={isMineFn(myTeamName, r.team)}>
          <div className="tabular" style={{ fontWeight: 700, color: 'rgba(0,0,0,0.6)', fontSize: 12 }}>
            {r.rank}
          </div>
          <div className="truncate" style={{ fontWeight: 500, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Badge text={r.team} size={20} mine={isMineFn(myTeamName, r.team)} logoUrl={logoFor(d.assets, r.team)} />
            <span className="truncate">{r.team}</span>
          </div>
          <div className="right tabular" style={{ fontSize: 12, color: 'rgba(0,0,0,0.6)' }}>
            {r.wins}-{r.losses}
          </div>
        </Row>
      ))}
    </div>
  );
}
