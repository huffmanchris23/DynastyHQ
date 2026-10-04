/**
 * ONE source of truth for week numbering. Previously dashboard.ts and
 * ocrShared.ts each carried their own postseason map and disagreed from
 * week 18 up (e.g. "national championship" was 19 in one, 21 in the other).
 * Now that weeks gate what members can see, a mismatch would silently hide
 * or show the wrong rows. Numbering follows team_schedule's week_name labels:
 *   0-14 regular season, 15 conference championship, 16 bowl / playoff round 1,
 *   17 playoff quarterfinals (or 2nd bowl week), 18 semifinals, 19 national championship.
 */

// Every label variant seen on-screen or in the database, lowercased.
const LABEL_TO_WEEK: Record<string, number> = {
  conference_championship: 15,
  'conference championships': 15,
  'conference championship': 15,
  bowl_game: 16,
  playoff_round_1: 16,
  'bowl week 1': 16,
  'cfb playoff - first round': 16,
  playoff_quarterfinals: 17,
  'bowl week 2': 17,
  'cfb playoff - quarterfinals': 17,
  playoff_semifinals: 18,
  'bowl week 3': 18,
  'cfb playoff - semifinals': 18,
  national_championship: 19,
  'national championship': 19,
};

function safeNum(v: any, fallback = 0): number {
  const n = Number(v);
  return isNaN(n) ? fallback : n;
}

/** "7" / "week_7" / "Bowl Week 1" / "playoff_quarterfinals" -> number */
export function resolveWeek(label: any): number {
  const raw = String(label ?? '').trim().toLowerCase();
  const m = raw.match(/^week_(-?\d+)$/);
  if (m) return Number(m[1]);
  if (LABEL_TO_WEEK[raw] !== undefined) return LABEL_TO_WEEK[raw];
  return safeNum(raw, 0);
}

/** team_schedule.week_name -> numeric week, or null if unrecognized (e.g. a bye label). */
export function weekFromScheduleName(name: any): number | null {
  const raw = String(name ?? '').trim().toLowerCase();
  const m = raw.match(/^week_(-?\d+)$/);
  if (m) return Number(m[1]);
  return LABEL_TO_WEEK[raw] ?? null;
}

/** Weeks a dynasty can be on: 0-19. Nothing below 0 exists. */
export const MIN_WEEK = 0;
export const MAX_WEEK = 19;

export function weekLabel(n: number): string {
  if (n === 15) return 'Conference Championship';
  if (n === 16) return 'Bowls / Playoff Round 1';
  if (n === 17) return 'Playoff Quarterfinals';
  if (n === 18) return 'Playoff Semifinals';
  if (n === 19) return 'National Championship';
  return `Week ${n}`;
}
