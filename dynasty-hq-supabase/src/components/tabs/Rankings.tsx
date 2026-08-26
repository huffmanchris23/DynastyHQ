import type { DashboardData } from '@/lib/types';
import { isMine as isMineFn, logoFor } from '@/lib/format';
import { Row, Thead } from '@/components/shared/Row';
import Badge from '@/components/shared/Badge';
import EmptyState from '@/components/shared/EmptyState';

export default function Rankings({ d, subtab }: { d: DashboardData; subtab: string | null }) {
  const list = subtab === 'coaches' ? d.rank.coaches : d.rank.ap;
  const myTeamName = d.team && d.team.TEAM_NAME;
  if (!list.length) return <EmptyState>No poll data yet.</EmptyState>;
  const cols = '30px 1fr 46px 60px';
  return (
    <div className="table primary">
      <Thead cols={cols}>
        <div style={{ textAlign: 'left' }}>Rk</div>
        <div style={{ textAlign: 'left' }}>Team</div>
        <div>LW</div>
        <div>W-L</div>
      </Thead>
      {list.map((r, i) => {
        const lw = r.lastWeek ?? null;
        const diff = lw !== null ? lw - r.rank : null;
        const dirColor = diff === null || diff === 0 ? 'rgba(255,255,255,0.4)' : diff > 0 ? '#3ecf72' : '#e05a5a';
        const dirArrow = diff === null ? '' : diff > 0 ? '▲' : diff < 0 ? '▼' : '–';
        return (
          <Row key={i} cols={cols} first={i === 0} mine={isMineFn(myTeamName, r.team)}>
            <div className="tabular" style={{ fontWeight: 700, color: 'rgba(255,255,255,0.6)', fontSize: 12 }}>
              {r.rank}
            </div>
            <div className="truncate" style={{ fontWeight: 500, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Badge text={r.team} size={20} mine={isMineFn(myTeamName, r.team)} logoUrl={logoFor(d.assets, r.team)} />
              <span className="truncate">{r.team}</span>
            </div>
            <div className="tabular" style={{ fontSize: 11, color: dirColor, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3 }}>
              <span>{dirArrow}</span>
              <span>{lw ?? '—'}</span>
            </div>
            <div className="right tabular" style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>
              {r.wins}-{r.losses}
            </div>
          </Row>
        );
      })}
    </div>
  );
}
