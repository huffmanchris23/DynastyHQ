'use client';

import type { DashboardData } from '@/lib/types';
import { gateInfo } from '@/lib/gating';
import { initials, toPct, numOr, abbrFor, logoFor, colorFor, rankedName } from '@/lib/format';
import SectionLabel from '@/components/shared/SectionLabel';
import Badge from '@/components/shared/Badge';
import EmptyState from '@/components/shared/EmptyState';

/* ---------------- renderHomeContent ---------------- */

function AroundTheNationList({ d }: { d: DashboardData }) {
  // 4 quick one-liners from around the country (content_input_type = drive_by).
  const items = ((d.content && d.content.driveBy) || []).slice(0, 4);
  return (
    <div>
      <SectionLabel>Around the Nation</SectionLabel>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {items.length ? (
          items.map((item, i) => {
            const accent = item.team ? colorFor(d.assets, item.team) : 'var(--primary)';
            return (
              <div
                key={i}
                style={{
                  display: 'flex', gap: 10, alignItems: 'center', fontSize: 13, lineHeight: 1.4,
                  background: '#FFFFFF', borderRadius: 6, padding: '9px 12px',
                  borderLeft: `4px solid ${accent}`,
                  boxShadow: '0 1px 2px rgba(0,0,0,0.06)',
                }}
              >
                {item.team ? (
                  <Badge text={item.team} size={22} logoUrl={logoFor(d.assets, item.team)} />
                ) : (
                  <span style={{ color: accent, fontWeight: 900, fontSize: 16, flexShrink: 0 }}>•</span>
                )}
                <span style={{ fontWeight: 500 }}>{item.headline}</span>
              </div>
            );
          })
        ) : (
          <div className="card">
            <EmptyState>No blurbs yet this week.</EmptyState>
          </div>
        )}
      </div>
    </div>
  );
}

/** 🌶️ x (1, 2, 3) — spice level for each of T.B.'s three takes, hottest last. */
function PepperRating({ level }: { level: number }) {
  return (
    <span style={{ flexShrink: 0, fontSize: 10 + level * 2, letterSpacing: '-1px', lineHeight: 1 }} aria-label={`Spice level ${level} of 3`}>
      {'🌶️'.repeat(level)}
    </span>
  );
}

// Cards get visibly hotter as the spice level climbs — mild amber for take
// #1, up to a deep red (matching the app's primary) for the hottest take.
const HEAT = [
  { bg: '#FFF6E9', border: '#E3A54B' },
  { bg: '#FDE7D9', border: '#D9642F' },
  { bg: '#FBDAD8', border: '#7A2426' },
];

function TopTakesList({ d }: { d: DashboardData }) {
  const items = ((d.content && d.content.topTakes) || []).slice(0, 3);
  return (
    <div style={{ marginTop: 16 }}>
      {/* Icon + large display-font title, instead of the generic SectionLabel treatment. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        {d.settings.tbIconUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={d.settings.tbIconUrl} alt="T.B. Walker" style={{ flexShrink: 0, width: 44, height: 44, borderRadius: 8, objectFit: 'cover' }} />
        ) : (
          <div
            style={{
              flexShrink: 0, width: 44, height: 44, borderRadius: 8,
              background: 'var(--primary)', color: '#FFFFFF',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 400,
            }}
          >
            TB
          </div>
        )}
        <span style={{ fontFamily: 'var(--font-display)', fontSize: 30, fontWeight: 400, letterSpacing: '0.01em' }}>
          T.B.'s Top Takes
        </span>
      </div>
      {items.length ? (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {items.map((item, i) => {
              const heat = HEAT[i] || HEAT[HEAT.length - 1];
              return (
                <div
                  key={i}
                  style={{
                    display: 'flex', gap: 10, alignItems: 'center',
                    background: heat.bg, borderRadius: 8, padding: '10px 12px',
                    borderLeft: `5px solid ${heat.border}`,
                    boxShadow: '0 1px 2px rgba(0,0,0,0.08)',
                  }}
                >
                  <PepperRating level={i + 1} />
                  {item.team ? <Badge text={item.team} size={22} logoUrl={logoFor(d.assets, item.team)} /> : null}
                  <div style={{ fontSize: 13, lineHeight: 1.4, fontWeight: 700, color: '#2A1A0F' }}>{item.headline}</div>
                </div>
              );
            })}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'rgba(0,0,0,0.4)' }}>
            {d.settings.tacoBellLogoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={d.settings.tacoBellLogoUrl} alt="Taco Bell" style={{ height: 14, width: 'auto' }} />
            ) : (
              <span>🌮</span>
            )}
            <span>Presented by Taco Bell</span>
          </div>
        </>
      ) : (
        <EmptyState>No takes yet this week.</EmptyState>
      )}
    </div>
  );
}

function HomeContent({ d }: { d: DashboardData }) {
  return (
    <>
      <AroundTheNationList d={d} />
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
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 10 }}>
          {d.settings.dhqBetsLogoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={d.settings.dhqBetsLogoUrl} alt="DHQBets" style={{ height: 28, width: 'auto' }} />
          ) : null}
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
