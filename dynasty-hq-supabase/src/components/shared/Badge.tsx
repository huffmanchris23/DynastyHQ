import { useState } from 'react';
import { initials } from '@/lib/format';

export default function Badge({
  text,
  size = 24,
  mine = false,
  logoUrl,
}: {
  text: any;
  size?: number;
  mine?: boolean;
  /** Optional team logo URL (assets.logo_url). Falls back to text initials if missing or if the image fails to load. */
  logoUrl?: string | null;
}) {
  const color = mine ? 'var(--accent)' : 'rgba(255,255,255,0.75)';
  const [broken, setBroken] = useState(false);

  if (logoUrl && !broken) {
    return (
      <div
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          background: 'rgba(255,255,255,0.92)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={logoUrl}
          alt=""
          width={size * 0.8}
          height={size * 0.8}
          referrerPolicy="no-referrer"
          style={{ width: size * 0.8, height: size * 0.8, objectFit: 'contain' }}
          onError={() => setBroken(true)}
        />
      </div>
    );
  }

  return (
    <div className="badge" style={{ width: size, height: size, fontSize: Math.round(size * 0.4), color }}>
      {initials(text)}
    </div>
  );
}
