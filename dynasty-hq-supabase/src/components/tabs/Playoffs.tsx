import type { DashboardData } from '@/lib/types';
import SectionLabel from '@/components/shared/SectionLabel';
import EmptyState from '@/components/shared/EmptyState';

// PlayoffRankings (CFP seed list) was removed — playoff_rankings was
// dropped from the schema and there's no data source for it anymore. This
// tab is just the uploaded bracket screenshot now.

export function Bracket({ d }: { d: DashboardData }) {
  if (!d.playoffBracketUrl) return <EmptyState>Bracket not posted yet.</EmptyState>;
  return (
    <>
      <SectionLabel>Playoffs</SectionLabel>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={d.playoffBracketUrl}
        alt="CFP Bracket"
        style={{ width: '100%', borderRadius: 4, border: '1px solid color-mix(in srgb, var(--primary) 60%, transparent)' }}
      />
    </>
  );
}
