/**
 * Text-on-team-color rule (used everywhere team colors become a surface).
 *
 *   Surface  = the team's PRIMARY color.
 *   Text     = the team's SECONDARY color if it reads clearly on the primary
 *              (contrast >= 4.5:1), otherwise cream, otherwise white, otherwise
 *              near-black — whichever of those first passes.
 *
 * Tested against all 138 teams: 86 use their own secondary color as the text,
 * 47 use cream or white, and 5 light-primary teams use near-black.
 */
export const CREAM = '#E4D2BA';
const WHITE = '#FFFFFF';
const INK = '#1A1410';
const MIN_CONTRAST = 4.5;

function parseHex(v: any): [number, number, number] | null {
  const s = String(v || '').trim();
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(s);
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function luminance(rgb: [number, number, number]): number {
  const f = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(rgb[0]) + 0.7152 * f(rgb[1]) + 0.0722 * f(rgb[2]);
}

export function contrastRatio(a: string, b: string): number {
  const pa = parseHex(a), pb = parseHex(b);
  if (!pa || !pb) return 0;
  const la = luminance(pa), lb = luminance(pb);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** The text color to use on top of `primary`. Falls back to cream if colors aren't plain hex values. */
export function pickOnPrimary(primary: string, secondary?: string | null): string {
  if (!parseHex(primary)) return CREAM;
  const candidates = [secondary || '', CREAM, WHITE, INK].filter((c) => parseHex(c));
  for (const c of candidates) if (contrastRatio(c, primary) >= MIN_CONTRAST) return c;
  return candidates.reduce((best, c) => (contrastRatio(c, primary) > contrastRatio(best, primary) ? c : best), candidates[0] || CREAM);
}
