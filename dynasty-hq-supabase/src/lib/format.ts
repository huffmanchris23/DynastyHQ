/**
 * ============================== UTIL ==============================
 * Port of the small formatting helpers from JavaScript.html.
 *
 * esc() is intentionally NOT ported: it existed only because the original
 * built raw HTML strings by hand. JSX escapes all text content by default,
 * so every call site that did `${esc(x)}` is just `{x}` in the React
 * version — same output, no behavior change.
 */

export function initials(name: any, n = 2): string {
  return String(name || '')
    .slice(0, n)
    .toUpperCase();
}

export function toPct(v: any): number | null {
  if (v === null || v === undefined || v === '') return null;
  let n = parseFloat(String(v).replace('%', ''));
  if (isNaN(n)) return null;
  if (n <= 1) n = n * 100; // handles 0.57-style decimal fractions from % cell formatting
  return n;
}

export function favoriteLine(compare: Record<string, { mine: any; opp: any }>, key: string, myTeam: any, oppTeam: any): string {
  const row = compare[key];
  if (!row) return '—';
  const mineNum = parseFloat(row.mine);
  const oppNum = parseFloat(row.opp);
  if (!isNaN(mineNum) && mineNum < 0) return `${myTeam} ${row.mine}`;
  if (!isNaN(oppNum) && oppNum < 0) return `${oppTeam} ${row.opp}`;
  return `${myTeam} ${row.mine}`;
}

export function numOr(v: any, fallback: any = '—'): any {
  return v === null || v === undefined || v === '' ? fallback : v;
}

export function isMine(myTeamName: any, teamName: any): boolean {
  return !!myTeamName && String(teamName || '').toUpperCase() === String(myTeamName).toUpperCase();
}

/**
 * Looks up a team's logo URL from the full assets list by name or
 * abbreviation, case-insensitively (team names are cased inconsistently
 * across source tables — "unlv" in some, "UNLV" in others).
 */
export function logoFor(assets: { TEAM_NAME?: any; TEAM_ABBREVIATION?: any; LOGO_URL?: any }[] | undefined, nameOrAbbr: any): string | undefined {
  if (!assets || !nameOrAbbr) return undefined;
  const k = String(nameOrAbbr).trim().toLowerCase();
  const match = assets.find(
    (a) => String(a.TEAM_NAME || '').toLowerCase() === k || String(a.TEAM_ABBREVIATION || '').toLowerCase() === k
  );
  return match?.LOGO_URL || undefined;
}

/** Same idea as logoFor, but returns the team's abbreviation instead of a logo URL — for compact display in odds/betting lines. */
export function abbrFor(assets: { TEAM_NAME?: any; TEAM_ABBREVIATION?: any }[] | undefined, nameOrAbbr: any): string {
  if (!assets || !nameOrAbbr) return String(nameOrAbbr || '');
  const k = String(nameOrAbbr).trim().toLowerCase();
  const match = assets.find(
    (a) => String(a.TEAM_NAME || '').toLowerCase() === k || String(a.TEAM_ABBREVIATION || '').toLowerCase() === k
  );
  return match?.TEAM_ABBREVIATION || String(nameOrAbbr);
}

/** Same idea as logoFor, but against the graphics (conference logo) table. */
export function logoForConference(graphics: { conference?: any; abbreviation?: any; logoUrl?: any }[] | undefined, name: any): string | undefined {
  if (!graphics || !name) return undefined;
  const k = String(name).trim().toLowerCase();
  const match = graphics.find((g) => String(g.conference || '').toLowerCase() === k || String(g.abbreviation || '').toLowerCase() === k);
  return match?.logoUrl || undefined;
}
