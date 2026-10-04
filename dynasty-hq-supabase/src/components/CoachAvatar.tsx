'use client';

import { avatarSvg } from '@/lib/avatars';

/** Renders a stored coach image value ("avatar:3"). Anything else is left to the caller. */
export function avatarIdFrom(value: any): number | null {
  const m = /^avatar:(\d+)$/.exec(String(value || ''));
  return m ? Number(m[1]) : null;
}

export default function CoachAvatar({ id, color, size = 84 }: { id: number; color?: string; size?: number }) {
  return (
    <span
      aria-hidden="true"
      style={{ display: 'inline-block', width: size, height: size, lineHeight: 0 }}
      dangerouslySetInnerHTML={{ __html: avatarSvg(id, color || '#12233f') }}
    />
  );
}
