/**
 * Pure helpers for the team_schedule OCR screen (no I/O, easy to test).
 *
 * Why this exists: the model's reading of the schedule table was being written
 * to the database with no sanity check at all. A misread week number or date
 * silently overwrote real rows (e.g. one Southern Miss game landing in weeks
 * 7, 8 and 9). The schedule table is highly structured — every week from the
 * first visible row to the last is listed, in order, byes included — so we can
 * cheaply tell when a read is wrong BEFORE it is written.
 */

/** The row labelled "Conf Champ" sits between week 14 and week 16. */
export const CONF_CHAMP_WEEK = 15;

/**
 * Turns whatever the model put in "week" into an integer week number, or null
 * if it can't be trusted. Handles 7, "7", "Week 7" and the "Conf Champ" row.
 */
export function normalizeScheduleWeek(raw: unknown): number | null {
  if (typeof raw === 'number') return Number.isInteger(raw) && raw >= 0 && raw <= 20 ? raw : null;
  const s = String(raw ?? '').trim().toLowerCase();
  if (!s) return null;
  if (/^conf(erence)?\.?\s*champ(ionship)?(\s*game)?$/.test(s) || s === 'ccg') return CONF_CHAMP_WEEK;
  const m = /^(?:week\s*)?(\d{1,2})$/.exec(s);
  if (!m) return null;
  const n = Number(m[1]);
  return n >= 0 && n <= 20 ? n : null;
}

export function isByeOpponent(raw: unknown): boolean {
  return /^bye(\s*week)?$/i.test(String(raw ?? '').trim());
}

export interface ScheduleCheck {
  /** Copy of the rows with week normalized to a number and byes written as "bye". */
  rows: any[];
  /** Empty when the read looks internally consistent. */
  problems: string[];
}

/**
 * Checks one schedule screenshot's rows for the failure modes seen in
 * production: unreadable/renumbered weeks, skipped rows, and one game date
 * appearing under several weeks.
 */
export function checkScheduleRows(rows: any[]): ScheduleCheck {
  const problems: string[] = [];
  const out = rows.map((r) => ({ ...r }));
  if (!out.length) problems.push('no rows were read from the screenshot');

  let prev: number | null = null;
  const weekForDate = new Map<string, number>();

  for (const r of out) {
    const wk = normalizeScheduleWeek(r.week);
    if (wk === null) {
      problems.push(`unreadable week "${r.week}"`);
      continue;
    }
    r.week = wk;
    if (isByeOpponent(r.opponent)) r.opponent = 'bye';

    // A schedule screenshot lists consecutive weeks; a gap means a row was
    // skipped or a week was misread, and either one shifts every row after it.
    if (prev !== null && wk !== prev + 1) {
      problems.push(`weeks ${prev} then ${wk} are not consecutive (a row was skipped or misnumbered)`);
    }
    prev = wk;

    // A team can't play two games on one date.
    const date = String(r.game_date ?? '').trim().toLowerCase();
    if (date && r.opponent !== 'bye') {
      const other = weekForDate.get(date);
      if (other !== undefined) problems.push(`weeks ${other} and ${wk} both show the date "${r.game_date}"`);
      else weekForDate.set(date, wk);
    }
  }

  problems.push(...checkScheduleDates(out));

  return { rows: out, problems };
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

function parseMonthDay(raw: unknown): { month: number; day: number } | null {
  const m = /^([A-Za-z]{3})[A-Za-z]*\.?\s+(\d{1,2})$/.exec(String(raw ?? '').trim());
  if (!m) return null;
  const month = MONTHS.indexOf(m[1].toLowerCase());
  const day = Number(m[2]);
  return month < 0 || day < 1 || day > 31 ? null : { month, day };
}

// Season runs Aug–Jan; a January date belongs to the following calendar year.
function dateFor(year: number, month: number, day: number): number {
  return Date.UTC(year + (month < 6 ? 1 : 0), month, day);
}

/**
 * Dates carry two independent signals the model has to get right at once: the
 * weekday ("Sat") and the day number ("Sep 5"). Digit misreads break that
 * pairing (a Saturday "Sep 2" next to a Saturday "Sep 12" is impossible), and
 * a dropped row breaks the ~7-days-per-week spacing. Both are checked against
 * the best-fitting calendar year, so no assumption is made about which
 * in-game year the dynasty is in.
 */
export function checkScheduleDates(rows: any[]): string[] {
  const dated = rows
    .map((r) => ({ week: r.week as number, md: parseMonthDay(r.game_date), dow: WEEKDAYS.indexOf(String(r.game_day ?? '').trim().toLowerCase().slice(0, 3)), date: r.game_date, day: r.game_day }))
    .filter((r) => typeof r.week === 'number' && r.md);
  if (dated.length < 2) return [];

  let best: { year: number; bad: typeof dated } | null = null;
  for (let year = 2020; year <= 2045; year++) {
    const bad = dated.filter((r) => r.dow >= 0 && new Date(dateFor(year, r.md!.month, r.md!.day)).getUTCDay() !== r.dow);
    if (!best || bad.length < best.bad.length) best = { year, bad };
  }
  const problems: string[] = [];
  if (best && best.bad.length) {
    const shown = best.bad.slice(0, 3).map((r) => `week ${r.week} "${r.day}, ${r.date}"`).join(', ');
    problems.push(`weekday and date don't agree for ${shown}`);
  }

  const year = best ? best.year : 2026;
  for (let i = 1; i < dated.length; i++) {
    const a = dated[i - 1];
    const b = dated[i];
    const days = (dateFor(year, b.md!.month, b.md!.day) - dateFor(year, a.md!.month, a.md!.day)) / 86400000;
    const expected = 7 * (b.week - a.week);
    // Thursday/Friday games move a date a couple of days either way.
    if (Math.abs(days - expected) > 4) {
      problems.push(`week ${a.week} (${a.date}) to week ${b.week} (${b.date}) is ${days} days apart; about ${expected} expected`);
    }
  }
  return problems;
}

// Alternate spellings the model (or the game) uses for teams, keyed by a
// lowercase, punctuation-free form. Values are canonical ocr_helper team_name
// values; an alias is only applied when its target exists in this league's
// helper rows, so a wrong guess here can never invent a team.
const ALIASES: Record<string, string> = {
  'southern mississippi': 'Southern Miss',
  usm: 'Southern Miss',
  usa: 'South Alabama',
  'ul monroe': 'Louisiana Monroe',
  'la monroe': 'Louisiana Monroe',
  'louisiana monroe': 'Louisiana Monroe',
  'ul lafayette': 'Louisiana',
  'louisiana lafayette': 'Louisiana',
  'ragin cajuns': 'Louisiana',
  'la tech': 'Louisiana Tech',
  'app state': 'Appalachian State',
  'appalachian st': 'Appalachian State',
  'ga southern': 'Georgia Southern',
  'ark state': 'Arkansas State',
  'arkansas st': 'Arkansas State',
  'texas st': 'Texas State',
  fau: 'Florida Atlantic',
};

function aliasKey(name: string): string {
  return name.trim().toLowerCase().replace(/[.']/g, '').replace(/-/g, ' ').replace(/\s+/g, ' ');
}

/** Canonical team name for a known alternate spelling, or null. */
export function resolveTeamAlias(name: unknown, knownCanonical: Set<string>): string | null {
  if (typeof name !== 'string' || !name.trim()) return null;
  const target = ALIASES[aliasKey(name)];
  return target && knownCanonical.has(target) ? target : null;
}
