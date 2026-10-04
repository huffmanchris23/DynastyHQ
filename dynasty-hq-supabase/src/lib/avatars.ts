/**
 * Ten simple coach avatars, drawn in code so they can wear the team's colors.
 * Stored on the coach as image_url = "avatar:<id>". Pure string output, no deps.
 */
export type Hair = 'none' | 'short' | 'crew' | 'wavy' | 'ponytail' | 'bob';
export type Headwear = 'none' | 'cap' | 'visor' | 'headset';
export type Beard = 'none' | 'full' | 'goatee' | 'mustache' | 'stubble';

export interface AvatarSpec {
  id: number;
  label: string;
  skin: string;
  hair: Hair;
  hairColor: string;
  headwear: Headwear;
  beard: Beard;
  glasses: boolean;
}

export const AVATARS: AvatarSpec[] = [
  { id: 1, label: 'Coach 1', skin: '#f1cfb0', hair: 'short', hairColor: '#5a3b22', headwear: 'cap', beard: 'none', glasses: false },
  { id: 2, label: 'Coach 2', skin: '#c68a5b', hair: 'short', hairColor: '#1d1612', headwear: 'headset', beard: 'none', glasses: false },
  { id: 3, label: 'Coach 3', skin: '#6b4429', hair: 'none', hairColor: '#1a1210', headwear: 'headset', beard: 'goatee', glasses: false },
  { id: 4, label: 'Coach 4', skin: '#e3b48a', hair: 'short', hairColor: '#9a9a9a', headwear: 'visor', beard: 'none', glasses: true },
  { id: 5, label: 'Coach 5', skin: '#f4d9c0', hair: 'crew', hairColor: '#d8b45c', headwear: 'none', beard: 'none', glasses: false },
  { id: 6, label: 'Coach 6', skin: '#8a5a38', hair: 'crew', hairColor: '#17110d', headwear: 'cap', beard: 'stubble', glasses: false },
  { id: 7, label: 'Coach 7', skin: '#d29a6a', hair: 'wavy', hairColor: '#2a1c14', headwear: 'none', beard: 'full', glasses: false },
  { id: 8, label: 'Coach 8', skin: '#f2d2b8', hair: 'short', hairColor: '#b5532b', headwear: 'cap', beard: 'full', glasses: false },
  { id: 9, label: 'Coach 9', skin: '#a56a42', hair: 'ponytail', hairColor: '#1d1411', headwear: 'visor', beard: 'none', glasses: false },
  { id: 10, label: 'Coach 10', skin: '#efc9aa', hair: 'bob', hairColor: '#4a2f1c', headwear: 'headset', beard: 'none', glasses: true },
];

function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(v + amt)));
  const r = f(n >> 16), g = f((n >> 8) & 255), b = f(n & 255);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

export function avatarSvg(id: number, teamColor = '#12233f', accent = '#f1ead8'): string {
  const a = AVATARS.find((x) => x.id === id) || AVATARS[0];
  const skinDark = shade(a.skin, -28);
  const ink = '#241c18';
  const p: string[] = [];

  p.push(`<circle cx="60" cy="60" r="60" fill="#e6e1d6"/>`);
  p.push(`<clipPath id="c${a.id}"><circle cx="60" cy="60" r="60"/></clipPath><g clip-path="url(#c${a.id})">`);

  // ponytail / bob sit behind the head
  if (a.hair === 'ponytail') p.push(`<path d="M80 44 C98 46 100 70 90 86 C88 74 84 62 78 56 Z" fill="${a.hairColor}"/>`);
  if (a.hair === 'bob') p.push(`<path d="M36 46 C34 30 46 20 60 20 C74 20 86 30 84 46 L86 78 C80 82 76 78 76 70 L44 70 C44 78 40 82 34 78 Z" fill="${a.hairColor}"/>`);

  // shoulders + polo + collar
  p.push(`<path d="M10 124 C10 98 32 88 60 88 C88 88 110 98 110 124 Z" fill="${teamColor}"/>`);
  p.push(`<path d="M46 89 L60 106 L74 89 L68 86 L60 94 L52 86 Z" fill="${accent}"/>`);
  // neck
  p.push(`<rect x="51" y="70" width="18" height="22" rx="7" fill="${skinDark}"/>`);
  p.push(`<path d="M46 89 L60 104 L74 89 L68 86 L60 96 L52 86 Z" fill="${teamColor}" opacity="0.0"/>`);
  // ears + head
  p.push(`<circle cx="38.5" cy="57" r="4.6" fill="${a.skin}"/><circle cx="81.5" cy="57" r="4.6" fill="${a.skin}"/>`);
  p.push(`<ellipse cx="60" cy="55" rx="21.5" ry="25" fill="${a.skin}"/>`);

  // beard (under features)
  if (a.beard === 'full') p.push(`<path d="M39.5 57 C38 88 82 88 80.5 57 C77 63 71 64 66 63.5 C63 62 57 62 54 63.5 C49 64 43 63 39.5 57 Z" fill="${a.hairColor}"/>`);
  if (a.beard === 'goatee') p.push(`<ellipse cx="60" cy="74.5" rx="5" ry="3.8" fill="${a.hairColor}"/>`);
  if (a.beard === 'stubble') p.push(`<path d="M40 60 C42 80 78 80 80 60 C76 72 68 75 60 75 C52 75 44 72 40 60 Z" fill="${a.hairColor}" opacity="0.35"/>`);

  // hair
  const hc = a.hairColor;
  if (a.hair === 'short') p.push(`<path d="M38.5 52 C36 33 48 26 60 26 C72 26 84 33 81.5 52 C79 42 72 37 60 37 C48 37 41 42 38.5 52 Z" fill="${hc}"/>`);
  if (a.hair === 'crew') p.push(`<path d="M39 50 C38 36 48 30 60 30 C72 30 82 36 81 50 C78 41 70 39 60 39 C50 39 42 41 39 50 Z" fill="${hc}"/>`);
  if (a.hair === 'wavy') p.push(`<path d="M37 54 C32 36 42 22 58 22 C74 20 88 32 83 54 C82 44 76 38 70 40 C66 36 58 36 52 40 C46 38 40 44 37 54 Z" fill="${hc}"/>`);
  if (a.hair === 'ponytail') p.push(`<path d="M38.5 52 C36 33 48 26 60 26 C72 26 84 33 81.5 52 C79 42 72 37 60 37 C48 37 41 42 38.5 52 Z" fill="${hc}"/>`);
  if (a.hair === 'bob') p.push(`<path d="M38 54 C36 34 48 26 60 26 C72 26 84 34 82 54 C80 44 70 38 60 38 C50 38 40 44 38 54 Z" fill="${hc}"/>`);

  // face
  p.push(`<circle cx="51" cy="55" r="2.1" fill="${ink}"/><circle cx="69" cy="55" r="2.1" fill="${ink}"/>`);
  p.push(`<path d="M46 49.5 Q51 47 56 49.5 M64 49.5 Q69 47 74 49.5" stroke="${a.hair === 'none' ? shade(a.skin, -70) : hc}" stroke-width="1.8" fill="none" stroke-linecap="round"/>`);
  p.push(`<path d="M60 56 Q57.5 62 60.5 63" stroke="${skinDark}" stroke-width="1.6" fill="none" stroke-linecap="round"/>`);
  if (a.beard === 'mustache') p.push(`<path d="M52 66 Q56 63 60 65 Q64 63 68 66 Q64 68 60 67 Q56 68 52 66 Z" fill="${hc}"/>`);
  const mouthY = a.beard === 'full' ? 70 : 68;
  p.push(`<path d="M53 ${mouthY} Q60 ${mouthY + 5} 67 ${mouthY}" stroke="${a.beard === 'full' ? '#f3e7dc' : shade(a.skin, -85)}" stroke-width="1.9" fill="none" stroke-linecap="round"/>`);

  if (a.glasses) p.push(`<g fill="none" stroke="${ink}" stroke-width="1.7"><rect x="43" y="49.5" width="14" height="10" rx="4"/><rect x="63" y="49.5" width="14" height="10" rx="4"/><path d="M57 54 H63"/></g>`);

  // headwear
  if (a.headwear === 'cap') {
    p.push(`<path d="M37 49 C36 29 48 22 60 22 C72 22 84 29 83 49 Z" fill="${teamColor}"/>`);
    p.push(`<path d="M37 48 H83 C92 48 98 52 100 56 C90 53 60 52 37 52 Z" fill="${shade(teamColor, 20)}"/>`);
    p.push(`<circle cx="60" cy="35" r="5" fill="${accent}" opacity="0.9"/>`);
  }
  if (a.headwear === 'visor') {
    p.push(`<path d="M37 45 C37 41 40 39 44 39 H76 C80 39 83 41 83 45 V47 H37 Z" fill="${teamColor}"/>`);
    p.push(`<path d="M37 46 H83 C92 46 98 50 100 54 C90 51 60 50 37 50 Z" fill="${shade(teamColor, 20)}"/>`);
  }
  if (a.headwear === 'headset') {
    p.push(`<path d="M37 56 C34 24 86 24 83 56" stroke="${ink}" stroke-width="3.2" fill="none" stroke-linecap="round"/>`);
    p.push(`<rect x="32" y="50" width="8" height="15" rx="3.5" fill="${ink}"/>`);
    p.push(`<path d="M36 64 Q38 76 52 73" stroke="${ink}" stroke-width="2.4" fill="none" stroke-linecap="round"/><circle cx="53" cy="73" r="3" fill="${ink}"/>`);
  }

  p.push(`</g>`);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" role="img" aria-label="${a.label}">${p.join('')}</svg>`;
}
