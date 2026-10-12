import { useEffect, useState } from 'react';
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

// Logo files are exported with very different amounts of empty padding, so the
// same display height made FOX look huge and NBC tiny. Every logo is trimmed
// to its visible artwork (in the browser, cached per URL) and then fit into
// the same box, so they all read at a consistent size. If a file can't be
// trimmed (cross-origin block, no intrinsic size) it's still fit into the box.
const BOX_WIDTH_PER_HEIGHT = 3.2;
const trimCache = new Map<string, string | null>();

function trimTransparentPadding(url: string): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onerror = () => resolve(null);
      img.onload = () => {
        try {
          const nw = img.naturalWidth;
          const nh = img.naturalHeight;
          if (!nw || !nh) return resolve(null);
          const scale = Math.min(2, 400 / Math.max(nw, nh));
          const w = Math.max(1, Math.round(nw * scale));
          const h = Math.max(1, Math.round(nh * scale));
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          if (!ctx) return resolve(null);
          ctx.drawImage(img, 0, 0, w, h);
          const { data } = ctx.getImageData(0, 0, w, h);

          let minX = w, minY = h, maxX = -1, maxY = -1;
          for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
              const i = (y * w + x) * 4;
              const visible = data[i + 3] > 16 && !(data[i] >= 250 && data[i + 1] >= 250 && data[i + 2] >= 250);
              if (!visible) continue;
              if (x < minX) minX = x;
              if (x > maxX) maxX = x;
              if (y < minY) minY = y;
              if (y > maxY) maxY = y;
            }
          }
          if (maxX < 0) return resolve(null);

          minX = Math.max(0, minX - 1);
          minY = Math.max(0, minY - 1);
          maxX = Math.min(w - 1, maxX + 1);
          maxY = Math.min(h - 1, maxY + 1);
          const cw = maxX - minX + 1;
          const ch = maxY - minY + 1;
          // Already tight — leave the original alone.
          if (cw >= w * 0.98 && ch >= h * 0.98) return resolve(null);

          const out = document.createElement('canvas');
          out.width = cw;
          out.height = ch;
          out.getContext('2d')!.drawImage(canvas, minX, minY, cw, ch, 0, 0, cw, ch);
          resolve(out.toDataURL('image/png'));
        } catch {
          resolve(null); // tainted canvas etc.
        }
      };
      img.src = url;
    } catch {
      resolve(null);
    }
  });
}

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
  const [trimmed, setTrimmed] = useState<string | null>(() => (url ? trimCache.get(url) ?? null : null));

  useEffect(() => {
    if (!url) return;
    if (trimCache.has(url)) {
      setTrimmed(trimCache.get(url) ?? null);
      return;
    }
    let cancelled = false;
    trimTransparentPadding(url).then((result) => {
      trimCache.set(url, result);
      if (!cancelled) setTrimmed(result);
    });
    return () => {
      cancelled = true;
    };
  }, [url]);

  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={trimmed || url}
        alt={name}
        height={height}
        referrerPolicy="no-referrer"
        style={{
          height,
          width: 'auto',
          maxWidth: Math.round(height * BOX_WIDTH_PER_HEIGHT),
          objectFit: 'contain',
          display: 'block',
        }}
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
