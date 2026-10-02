/**
 * ============================== OCR SHARED ==============================
 * Shared by /api/ocr-upload and /api/ocr-process. Scoped per dynasty/member via OcrCtx.
 */

export const SCREEN_TYPES = [
  'team_schedule_1',
  'team_schedule_2',
  // 'best_matchups' (the old grid-only screenshot) retired 2026-09-22 —
  // superseded by the 5 best_matchup_N detail screenshots below, which are
  // now the sole source for best_matchups. The grid version was a genuine
  // source of confusion (stray leftover rows with no odds/broadcast ever
  // computed for them, since only the detail screenshots trigger those
  // engines) and is no longer an active ocr_screen_guides entry.
  // Same Scores/Schedules screen as best_matchups, toggled back to the
  // PRIOR week so it shows final scores instead of kickoff times. One
  // screenshot, whatever the full Top 25 grid shows — feeds the content
  // engine's "what happened last week" input.
  'last_week_results',
  // The 5 tracked biggest games of the week, one screenshot per game (the
  // Scores/Schedules screen with that game's row selected so its detail
  // panel — records, date/time, location — shows on the right). Each
  // slot's guide row is "best_matchup" (singular), found the same way
  // stats_offense_1/_2 both resolve to "stats_offense" below.
  'best_matchup_1',
  'best_matchup_2',
  'best_matchup_3',
  'best_matchup_4',
  'best_matchup_5',
  'conference_standings',
  'top25',
  'stats_offense_1',
  'stats_offense_2',
  'stats_defense_1',
  'stats_defense_2',
  'hot_seats',
  'heisman',
] as const;

export type ScreenType = (typeof SCREEN_TYPES)[number];

// Maps an upload-slot id (e.g. "stats_offense_1") to the guide row's
// screen_type (e.g. "stats_offense") — the guide table doesn't distinguish
// part 1 vs part 2, only the filename does.
export function guideScreenType(slot: ScreenType): string {
  return slot.replace(/_\d$/, '');
}

import type { DynastyCtx } from './dynastyContext';

/** Screens every member uploads (their own team). The commish may upload every slot. */
export const MEMBER_SLOTS: ScreenType[] = SCREEN_TYPES.filter((s) =>
  /^(team_schedule_[12]|stats_offense_[12]|stats_defense_[12]|conference_standings(_\d+)?)$/.test(s)
) as ScreenType[];

/** One private bucket for every dynasty's screenshots: {dynastyId}/{userId}/w{week}_{slot}.png */
export const SCREENSHOT_BUCKET = 'screenshots';

// season/week column handling per target table. After the schema rebuild every
// season/week column is an integer, and team_schedule carries BOTH a numeric
// week and its week_name label.
export interface ContextColumns {
  seasonCol: 'season';
  weekCol: 'week';
  seasonValue: (season: number) => number;
  weekValue: (week: number) => number;
}

const SAME: ContextColumns = { seasonCol: 'season', weekCol: 'week', seasonValue: (s) => s, weekValue: (w) => w };
const CONTEXT_COLUMNS: Record<string, ContextColumns> = {
  team_schedule: SAME,
  best_matchups: SAME,
  conference_standings: SAME,
  top_25: SAME,
  team_stats: SAME,
  coaching_hotseats: SAME,
  heisman_trophy: SAME,
  // Shows the PRIOR week's final scores (same screen as best_matchups,
  // toggled back one week), so it is stamped one week behind.
  weekly_results: { ...SAME, weekValue: (w) => w - 1 },
};

export function contextColumnsFor(targetTable: string): ContextColumns {
  const cols = CONTEXT_COLUMNS[targetTable];
  if (!cols) throw new Error(`No season/week column mapping for table "${targetTable}" — add one to ocrShared.ts.`);
  return cols;
}

export interface OcrCtx {
  season: number;
  /** The week being built (the open cycle's target). */
  week: number;
  dynastyId: string;
  userId: string;
  team: string | null;
  isCommish: boolean;
  /** storage folder for THIS caller's files in the screenshots bucket */
  folder: string;
  bucket: string;
}

/**
 * The open upload cycle: dynasties.staged_week is the week being built; it only
 * counts as "open" while it is ahead of the live week (or nothing is live yet).
 */
export function openWeekOf(c: DynastyCtx): number | null {
  if (c.stagedWeek === null) return null;
  if (c.liveWeek !== null && c.stagedWeek <= c.liveWeek) return null;
  return c.stagedWeek;
}

export function toOcrCtx(c: DynastyCtx, week: number): OcrCtx {
  return {
    season: c.season,
    week,
    dynastyId: c.dynastyId,
    userId: c.userId,
    team: c.team,
    isCommish: c.isCommish,
    folder: `${c.dynastyId}/${c.userId}`,
    bucket: SCREENSHOT_BUCKET,
  };
}

export function buildFileName(slot: ScreenType, week: number): string {
  return `w${week}_${slot}.png`;
}

// The PlayStation app (and others) export screenshots as JPEG regardless of
// the .png filename convention we use for matching — Anthropic's API
// rejects a mismatch between declared media_type and actual bytes, so this
// sniffs the real format from the file's magic bytes instead of trusting
// the extension or assuming PNG.
export function sniffImageMediaType(buffer: Buffer): 'image/png' | 'image/jpeg' {
  const isPng = buffer.length >= 8 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47;
  return isPng ? 'image/png' : 'image/jpeg'; // JPEG magic (FF D8 FF) covers everything else we expect here
}
