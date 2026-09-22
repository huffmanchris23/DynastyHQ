import { useState } from 'react';
import { logoForNetwork } from '@/lib/format';

/**
 * Renders a broadcast network's logo image (from the "network_logos"
 * storage bucket), falling back to the plain uppercase network text if
 * there's no logo for it (e.g. "TBD") or every filename-case variant
 * fails to load. Supabase storage is case-sensitive and file uploads from
 * a phone's file picker don't always preserve the exact case the code
 * expects (e.g. "FOX.png" landing as "fox.png"), so this tries a couple
 * of common variants before giving up on the image entirely.
 */
export default function NetworkLogo({ network, height = 14 }: { network: any; height?: number }) {
  const name = String(network || '').trim();
  const candidates = name
    ? [...new Set([name, name.toUpperCase(), name.toLowerCase()])].map((n) => logoForNetwork(n)).filter(Boolean)
    : [];
  const [attempt, setAttempt] = useState(0);

  const url = candidates[attempt];

  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt={name}
        height={height}
        referrerPolicy="no-referrer"
        style={{ height, width: 'auto', objectFit: 'contain', display: 'block' }}
        onError={() => setAttempt((a) => a + 1)}
      />
    );
  }

  return (
    <div style={{ fontSize: 8, textTransform: 'uppercase', color: 'rgba(0,0,0,0.4)', fontWeight: 700 }}>
      {network || 'TBD'}
    </div>
  );
}
