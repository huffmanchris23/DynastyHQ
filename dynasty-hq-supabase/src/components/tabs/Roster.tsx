import { useState } from 'react';
import type { DashboardData } from '@/lib/types';
import SectionLabel from '@/components/shared/SectionLabel';
import EmptyState from '@/components/shared/EmptyState';

function LinkBlock({ label, link }: { label: string; link: string | null }) {
  const [broken, setBroken] = useState(false);
  return (
    <div>
      <SectionLabel>{label}</SectionLabel>
      {link && !broken ? (
        <div className="card" style={{ padding: 8 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={link}
            alt={label}
            style={{ width: '100%', height: 'auto', borderRadius: 8, display: 'block' }}
            onError={() => setBroken(true)}
          />
          <a href={link} target="_blank" rel="noreferrer" style={{ display: 'block', textAlign: 'center', padding: '10px 0 4px', fontSize: 11, color: 'rgba(0,0,0,0.4)' }}>
            Open full size
          </a>
        </div>
      ) : link && broken ? (
        // The URL exists but the image failed to load (private/broken link) — fall back to a link-out instead of a dead image box.
        <div className="card">
          <a href={link} target="_blank" rel="noreferrer" style={{ display: 'block', textAlign: 'center', padding: '24px 0', color: 'var(--accent)', fontWeight: 600 }}>
            📎 Open Screenshot
          </a>
        </div>
      ) : (
        <EmptyState>No screenshot linked yet.</EmptyState>
      )}
    </div>
  );
}

export function DepthCharts({ d }: { d: DashboardData }) {
  const r = d.roster || ({} as DashboardData['roster']);
  return (
    <>
      <LinkBlock label="Offensive Depth Chart" link={r.depthChartLinkOffense} />
      <div style={{ marginTop: 16 }}>
        <LinkBlock label="Defensive Depth Chart" link={r.depthChartLinkDefense} />
      </div>
    </>
  );
}


