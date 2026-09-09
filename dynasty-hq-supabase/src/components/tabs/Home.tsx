'use client';

import type { DashboardData } from '@/lib/types';
import { gateInfo } from '@/lib/gating';
import { initials, toPct, numOr, abbrFor, logoFor, rankedName } from '@/lib/format';
import SectionLabel from '@/components/shared/SectionLabel';
import Badge from '@/components/shared/Badge';
import EmptyState from '@/components/shared/EmptyState';

/* ---------------- renderHomeContent ---------------- */

function DriveByList({ d }: { d: DashboardData }) {
  const items = ((d.content && d.content.driveBy) || []).slice(0, 5);
  return (
    <div>
      <SectionLabel>Dynasty Drive-by</SectionLabel>
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {items.length ? (
          items.map((item, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13, lineHeight: 1.4 }}>
              {item.team ? (
                <Badge text={item.team} size={20} logoUrl={logoFor(d.assets, item.team)} />
              ) : (
                <span style={{ color: 'var(--primary)', fontWeight: 700, flexShrink: 0 }}>•</span>
              )}
              <span style={{ marginTop: 1 }}>{item.headline}</span>
            </div>
          ))
        ) : (
          <EmptyState>No drive-by yet this week.</EmptyState>
        )}
      </div>
    </div>
  );
}

function TopTakesList({ d }: { d: DashboardData }) {
  const items = ((d.content && d.content.topTakes) || []).slice(0, 3);
  return (
    <div style={{ marginTop: 16 }}>
      <SectionLabel>T.B.'s Top 3 Takes</SectionLabel>
      {items.length ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {items.map((item, i) => (
            <div key={i} className="card" style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <span
                style={{
                  flexShrink: 0, width: 20, height: 20, borderRadius: '50%', background: 'var(--primary)', color: '#FFFFFF',
                  fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                {i + 1}
              </span>
              {item.team ? <Badge text={item.team} size={20} logoUrl={logoFor(d.assets, item.team)} /> : null}
              <div style={{ fontSize: 13, lineHeight: 1.4, fontWeight: 500, marginTop: 1 }}>{item.headline}</div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState>No takes yet this week.</EmptyState>
      )}
    </div>
  );
}

function HomeContent({ d }: { d: DashboardData }) {
  return (
    <>
      <DriveByList d={d} />
      <TopTakesList d={d} />
    </>
  );
}

/* ---------------- LastGameCard ---------------- */

function LastGameCard({ d }: { d: DashboardData }) {
  const box = d.recap && d.recap.myBox;
  const opp = d.recap && d.recap.oppBox;
  if (!box || box.FINAL_SCORE === undefined || box.FINAL_SCORE === null) return null;
  const won = numOr(box.FINAL_SCORE, 0) > numOr(opp?.FINAL_SCORE, 0);
  const myLogo = d.team?.LOGO_URL || logoFor(d.assets, box.TEAM);
  const oppLogo = logoFor(d.assets, box.OPPONENT);
  return (
    <div className="card primary tight" style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <SectionLabel>Last Game</SectionLabel>
        <span
          style={{
            fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em',
            color: won ? '#000000' : '#e05a5a',
            border: `1px solid ${won ? '#000000' : '#e05a5a'}`,
            borderRadius: 4, padding: '2px 6px',
          }}
        >
          {won ? 'W' : 'L'}
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, width: 64 }}>
          <Badge text={box.TEAM} size={36} mine logoUrl={myLogo} />
          <span className="truncate" style={{ fontSize: 10, color: 'rgba(0,0,0,0.55)', maxWidth: 64, textAlign: 'center' }}>
            {box.TEAM}
          </span>
        </div>
        <div className="tabular" style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 400, display: 'flex', alignItems: 'center', gap: 6 }}>
          <span>{numOr(box.FINAL_SCORE)}</span>
          <span style={{ color: 'rgba(0,0,0,0.35)', fontSize: 16 }}>–</span>
          <span>{numOr(opp?.FINAL_SCORE)}</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, width: 64 }}>
          <Badge text={box.OPPONENT} size={36} logoUrl={oppLogo} />
          <span className="truncate" style={{ fontSize: 10, color: 'rgba(0,0,0,0.55)', maxWidth: 64, textAlign: 'center' }}>
            {box.OPPONENT}
          </span>
        </div>
      </div>
    </div>
  );
}

/* ---------------- SeasonRecapCard ---------------- */
/* Shown in place of the normal preview/recap cards during preseason (before
   the new season's schedule is even known) — a look back at how the last
   season ended, via whatever image is on file in playoff_bracket for this
   week. Replaces the old TeamPreview (Preseason Ratings / Preseason Honors)
   entirely — those sections never had real data wired to them anyway. */

function SeasonRecapCard({ d }: { d: DashboardData }) {
  if (!d.playoffBracketUrl) return null;
  return (
    <div className="card primary tight" style={{ marginBottom: 12 }}>
      <SectionLabel>Last Season</SectionLabel>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={d.playoffBracketUrl}
        alt="Final CFP Bracket"
        style={{ width: '100%', borderRadius: 4, marginTop: 6, border: '1px solid color-mix(in srgb, var(--primary) 60%, transparent)' }}
      />
    </div>
  );
}

/* ---------------- renderHome ---------------- */

export default function Home({ d }: { d: DashboardData }) {
  const g = gateInfo(d);
  const contentBlock = <HomeContent d={d} />;

  if (g.isLocked || d.isPreseason) {
    return (
      <>
        <SeasonRecapCard d={d} />
        {contentBlock}
      </>
    );
  }

  const preview = d.preview;
  let nextGameCard: React.ReactNode = null;
  let predictorCard: React.ReactNode = null;

  if (preview) {
    const myTeamAbbr = initials(preview.myTeam, 3);
    const oppAbbr = initials(preview.oppTeam, 3);
    const myRecW = d.record ? d.record.wins : '';
    const myRecL = d.record ? d.record.losses : '';
    const oppRecW = preview.oppWins ?? '';
    const oppRecL = preview.oppLosses ?? '';
    // Once CFP rankings are live, show "(N) Team Name" for ranked teams —
    // falls back to the plain name if playoff rankings aren't live yet or
    // a team is unranked.
    // Ranked label follows the team throughout the app now — CFP rank once
    // the playoff field is set, falling back to the consolidated Top 25
    // poll the rest of the season (see rankFor/rankedName in format.ts).
    const myTeamLabel = rankedName(d, preview.myTeam);
    const oppTeamLabel = rankedName(d, preview.oppTeam);
    // favorite/spread/moneyline come straight off game_preview now — no
    // mine-vs-opp comparison needed, the sheet already names the favorite.
    const favoriteAbbr = preview.favorite ? abbrFor(d.assets, preview.favorite) : null;
    const spread = favoriteAbbr ? `${favoriteAbbr} ${preview.favoriteSpread ?? ''}` : '—';
    const total = numOr(preview.overUnder);
    const ml = favoriteAbbr ? `${favoriteAbbr} ${preview.favoriteMoneyline ?? ''}` : '—';
    const wpMineRaw = toPct(preview.winProbabilityMine);
    const wpOppRaw = toPct(preview.winProbabilityOpp);
    const wpMine = wpMineRaw === null ? 50 : wpMineRaw;
    const wpOpp = wpOppRaw === null ? 50 : wpOppRaw;
    const myColor = (d.team && d.team.PRIMARY_COLOR) || 'var(--accent)';
    const oppColor = (d.opponent && d.opponent.PRIMARY_COLOR) || 'rgba(0,0,0,0.35)';

    nextGameCard = (
      <div className="card accent tight">
        <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'rgba(0,0,0,0.4)', marginBottom: 6 }}>
          {preview.day} · {preview.date} · {preview.time} · {preview.location} · {preview.broadcast}
        </div>
        <div className="team-line">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Badge text={oppAbbr} size={28} logoUrl={d.opponent && d.opponent.LOGO_URL} />
            <span style={{ fontWeight: 600 }}>{oppTeamLabel}</span>
          </div>
          <span className="tabular" style={{ color: 'rgba(0,0,0,0.5)' }}>
            {oppRecW}-{oppRecL}
          </span>
        </div>
        <div className="team-line">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Badge text={myTeamAbbr} size={28} mine logoUrl={d.team && d.team.LOGO_URL} />
            <span style={{ fontWeight: 600 }}>{myTeamLabel}</span>
          </div>
          <span className="tabular" style={{ color: 'rgba(0,0,0,0.5)' }}>
            {myRecW}-{myRecL}
          </span>
        </div>
        <div className="grid-3" style={{ marginTop: 8, textAlign: 'center' }}>
          <div>
            <div style={{ fontSize: 9, textTransform: 'uppercase', color: 'rgba(0,0,0,0.4)' }}>Spread</div>
            <div style={{ fontSize: 12, fontWeight: 600, marginTop: 2 }}>{spread}</div>
          </div>
          <div>
            <div style={{ fontSize: 9, textTransform: 'uppercase', color: 'rgba(0,0,0,0.4)' }}>Total O/U</div>
            <div style={{ fontSize: 12, fontWeight: 600, marginTop: 2 }}>{total}</div>
          </div>
          <div>
            <div style={{ fontSize: 9, textTransform: 'uppercase', color: 'rgba(0,0,0,0.4)' }}>Moneyline</div>
            <div style={{ fontSize: 12, fontWeight: 600, marginTop: 2 }}>{ml}</div>
          </div>
        </div>
      </div>
    );

    predictorCard = (
      <div className="card primary">
        <SectionLabel>Win Probability</SectionLabel>
        <div style={{ display: 'flex', justifyContent: 'space-between', margin: '8px 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Badge text={oppAbbr} size={22} logoUrl={d.opponent && d.opponent.LOGO_URL} />
            <b>{Math.round(wpOpp)}%</b>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <b>{Math.round(wpMine)}%</b>
            <Badge text={myTeamAbbr} size={22} mine logoUrl={d.team && d.team.LOGO_URL} />
          </div>
        </div>
        <div className="wp-bar">
          <div style={{ width: `${Math.max(wpOpp - 1, 0)}%`, background: oppColor }} />
          <div style={{ width: '2%' }} />
          <div style={{ width: `${Math.max(wpMine - 1, 0)}%`, background: myColor }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 10, textTransform: 'uppercase', color: 'rgba(0,0,0,0.4)' }}>
          <span>{oppTeamLabel}</span>
          <span>{myTeamLabel}</span>
        </div>
      </div>
    );
  }

  return (
    <>
      <LastGameCard d={d} />
      {nextGameCard}
      {predictorCard}
      {!preview && d.isOffseason ? (
        <div className="card primary tight" style={{ textAlign: 'center', padding: '20px 12px' }}>
          <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'rgba(0,0,0,0.4)', fontWeight: 700 }}>
            Offseason
          </div>
          <div style={{ fontSize: 13, color: 'rgba(0,0,0,0.5)', marginTop: 4 }}>No game scheduled — check back next season.</div>
        </div>
      ) : null}
      <div style={{ marginTop: 16 }}>{contentBlock}</div>
    </>
  );
}
