import { useState } from 'react';
import { logoForNetwork } from '@/lib/format';

type NetworkSettings = Parameters<typeof logoForNetwork>[1];

const SETTINGS_KEY_BY_NETWORK: Record<string, keyof NonNullable<NetworkSettings>> = {
  ABC: 'abcLogo',
  NBC: 'nbcLogo',
  CBS: 'cbsLogo',
  ESPN: 'espnLogo',
  ESPN2: 'espn2Logo',
  'ESPN+': 'espnPlusLogo',
};

/**
 * Renders a broadcast network's logo, falling back to the plain uppercase
 * network text if there's no logo for it (e.g. "TBD") or every candidate
 * URL fails to load.
 *
 * Prefers the real, admin-managed logo from `settings` (pass d.settings
 * in) — a single authoritative URL, no guessing needed. Only for a
 * network settings doesn't have yet (currently just FOX) does this fall
 * back to guessing a filename in the "network_logos" storage bucket,
 * trying a couple of common casings since Supabase storage is
 * case-sensitive and phone file pickers don't always preserve the exact
 * case the code expects (e.g. "FOX.png" landing as "fox.png").
 */
export default function NetworkLogo({ network, settings, height = 14 }: { network: any; settings?: NetworkSettings; height?: number }) {
  const name = String(network || '').trim();
  const settingsUrl = name && settings ? settings[SETTINGS_KEY_BY_NETWORK[name.toUpperCase()]] : null;

  const candidates = !name
    ? []
    : settingsUrl
    ? [settingsUrl]
    : [...new Set([name, name.toUpperCase(), name.toLowerCase()])].map((n) => logoForNetwork(n)).filter(Boolean);
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
