'use client';

import type { DashboardData } from '@/lib/types';
import { logoFor } from '@/lib/format';
import Badge from '@/components/shared/Badge';
import SectionLabel from '@/components/shared/SectionLabel';
import EmptyState from '@/components/shared/EmptyState';

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
    <div>
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
              fontFamily: 'var(--font-fun)', fontSize: 18,
            }}
          >
            TB
          </div>
        )}
        <span style={{ fontFamily: 'var(--font-fun)', fontSize: 34, letterSpacing: '0.02em' }}>
          T.B.'s Top Takes
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'rgba(0,0,0,0.4)' }}>
        {d.settings.tacoBellLogoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={d.settings.tacoBellLogoUrl} alt="Taco Bell" style={{ height: 14, width: 'auto' }} />
        ) : (
          <span>🌮</span>
        )}
        <span>Presented by Taco Bell</span>
      </div>
      {items.length ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {items.map((item, i) => {
            const heat = HEAT[i] || HEAT[HEAT.length - 1];
            return (
              <div
                key={i}
                style={{
                  display: 'flex', gap: 10, alignItems: 'center',
                  background: heat.bg, borderRadius: 8, padding: '10px 14px',
                  borderLeft: `5px solid ${heat.border}`,
                  boxShadow: '0 1px 2px rgba(0,0,0,0.08)',
                }}
              >
                {item.team ? <Badge text={item.team} size={24} logoUrl={logoFor(d.assets, item.team)} /> : null}
                <div
                  style={{
                    fontFamily: 'inherit', fontSize: 13, lineHeight: 1.3,
                    fontWeight: 500, color: '#2A1A0F',
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1, minWidth: 0,
                  }}
                >
                  {item.headline}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <EmptyState>No takes yet this week.</EmptyState>
      )}
    </div>
  );
}

// The extra weekly screenshot/graphic Chris drops in alongside the takes —
// piggybacks on content.content_graphic_url for whichever top_take row
// carries it, no new column needed.
function TakesGraphic({ d }: { d: DashboardData }) {
  const withGraphic = ((d.content && d.content.topTakes) || []).find((t) => t.graphicUrl);
  if (!withGraphic || !withGraphic.graphicUrl) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={withGraphic.graphicUrl}
      alt="This week's take graphic"
      style={{ width: '100%', borderRadius: 8, marginTop: 12, border: '1px solid rgba(0,0,0,0.1)' }}
    />
  );
}

// Latest episode thumbnail — content_input_type containing "podcast",
// using the same content_graphic_url column as everything else in this
// table. headline doubles as the episode title.
function LatestEpisode({ d }: { d: DashboardData }) {
  const ep = ((d.content && d.content.podcast) || [])[0];
  return (
    <div style={{ marginTop: 20 }}>
      <SectionLabel>Latest 4th & Forever</SectionLabel>
      {ep ? (
        <div className="card tight" style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {ep.graphicUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={ep.graphicUrl} alt={ep.headline || 'Episode thumbnail'} style={{ width: 64, height: 64, borderRadius: 6, objectFit: 'cover', flexShrink: 0 }} />
          ) : null}
          <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.3 }}>{ep.headline}</div>
        </div>
      ) : (
        <div className="card tight">
          <EmptyState>No episode posted yet.</EmptyState>
        </div>
      )}
    </div>
  );
}

export default function FourthAndForever({ d }: { d: DashboardData }) {
  return (
    <>
      <TopTakesList d={d} />
      <TakesGraphic d={d} />
      <LatestEpisode d={d} />
    </>
  );
}
