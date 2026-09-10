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
