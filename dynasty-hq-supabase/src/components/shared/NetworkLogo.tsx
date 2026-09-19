import { useState } from 'react';
import { logoForNetwork } from '@/lib/format';

/**
 * Renders a broadcast network's logo image (from the "network_logos"
 * storage bucket), falling back to the plain uppercase network text if
 * there's no logo for it (e.g. "TBD") or the image fails to load — same
 * graceful-fallback pattern as the team Badge component, just text instead
 * of initials since "FOX"/"NBC" etc. are already short and clear as text.
 */
export default function NetworkLogo({ network, height = 14 }: { network: any; height?: number }) {
  const url = logoForNetwork(network);
  const [broken, setBroken] = useState(false);

  if (url && !broken) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt={String(network || '')}
        height={height}
        referrerPolicy="no-referrer"
        style={{ height, width: 'auto', objectFit: 'contain', display: 'block' }}
        onError={() => setBroken(true)}
      />
    );
  }

  return (
    <div style={{ fontSize: 8, textTransform: 'uppercase', color: 'rgba(0,0,0,0.4)', fontWeight: 700 }}>
      {network || 'TBD'}
    </div>
  );
}
