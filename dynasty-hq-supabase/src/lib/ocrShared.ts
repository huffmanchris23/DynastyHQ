/**
 * ============================== OCR SHARED ==============================
 * Shared by /api/ocr-upload and /api/ocr-process. Not used by the main
 * dashboard read path — dashboard.ts stays untouched.
 */

import { getSupabase } from './supabaseClient';

// Solo/god-mode scope — same constants referenced throughout the schema.
// Not read from env/config since this app has exactly one user/dynasty.
export const USER_ID = 'csh001';
export const DYNASTY_ID = '00001';

export const SCREEN_TYPES = [
  'team_schedule_1',
  'team_schedule_2',
  'best_matchups',
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

// game_preview.week is text ("0".."14" during the regular season, or a
// postseason label). Same normalization dashboard.ts uses for statsWeek,
// duplicated here so this file has no import dependency on dashboard.ts.
const POSTSEASON_WEEK_MAP: Record<string, number> = {
  'conference championships': 15,
  'bowl week 1': 16,
  'bowl week 2': 17,
  'cfb playoff - first round': 18,
  'cfb playoff - quarterfinals': 19,
  'cfb playoff - semifinals': 20,
  'national championship': 21,
};

function safeNum(v: any, fallback = 0): number {
  const n = Number(v);
  return isNaN(n) ? fallback : n;
}

function resolveWeek(label: any): number {
  const raw = String(label ?? '').trim();
  const mapped = POSTSEASON_WEEK_MAP[raw.toLowerCase()];
  return mapped !== undefined ? mapped : safeNum(raw, 0);
}

// dynasty_id is bigint on some tables, text on others — see the schema
// note in ocr_screen_guides.extraction_rules history. Bigint columns get
// the numeric value 1; text columns get the string "00001" to match every
// other row already in those tables.
const BIGINT_DYNASTY_ID_TABLES = new Set(['conference_standings', 'game_preview', 'best_matchups']);

export function dynastyIdFor(targetTable: string): string | number {
  return BIGINT_DYNASTY_ID_TABLES.has(targetTable) ? Number(DYNASTY_ID) : DYNASTY_ID;
}

// How to write season/week onto each target table — column names and types
// vary (confirmed against live data, not guessed):
//   - team_schedule has no "week" column, only week_name ("week_7" format)
//   - top_25.week is text storing a plain integer string ("-1", "7"...)
//   - everything else uses numeric season/week columns directly
export interface ContextColumns {
  seasonCol: 'season';
  weekCol: 'week' | 'week_name';
  seasonValue: (season: number) => string | number;
  weekValue: (week: number) => string | number;
}

const CONTEXT_COLUMNS: Record<string, ContextColumns> = {
  team_schedule: { seasonCol: 'season', weekCol: 'week_name', seasonValue: (s) => s, weekValue: (w) => `week_${w}` },
  best_matchups: { seasonCol: 'season', weekCol: 'week', seasonValue: (s) => s, weekValue: (w) => w },
  conference_standings: { seasonCol: 'season', weekCol: 'week', seasonValue: (s) => String(s), weekValue: (w) => w },
  top_25: { seasonCol: 'season', weekCol: 'week', seasonValue: (s) => s, weekValue: (w) => String(w) },
  team_stats: { seasonCol: 'season', weekCol: 'week', seasonValue: (s) => s, weekValue: (w) => w },
  coaching_hotseats: { seasonCol: 'season', weekCol: 'week', seasonValue: (s) => s, weekValue: (w) => w },
  heisman_trophy: { seasonCol: 'season', weekCol: 'week', seasonValue: (s) => s, weekValue: (w) => w },
};

export function contextColumnsFor(targetTable: string): ContextColumns {
  const cols = CONTEXT_COLUMNS[targetTable];
  if (!cols) throw new Error(`No season/week column mapping for table "${targetTable}" — add one to ocrShared.ts.`);
  return cols;
}

export interface CurrentContext {
  season: number;
  week: number;
  bucket: string;
}

// Single source of truth for "what week/season/bucket are we on right now" —
// mirrors the game_preview.current_week=true anchor row dashboard.ts uses,
// so the Upload tab and the dashboard never disagree about the current week.
export async function getCurrentContext(): Promise<CurrentContext> {
  const sb = getSupabase();

  const { data: settingsRows, error: settingsErr } = await sb
    .from('settings')
    .select('current_season')
    .eq('user_id', USER_ID)
    .eq('dynasty_id', DYNASTY_ID)
    .limit(1);
  if (settingsErr) throw new Error(`settings: ${settingsErr.message}`);
  const season = safeNum(settingsRows?.[0]?.current_season, 1);

  const { data: gpRows, error: gpErr } = await sb
    .from('game_preview')
    .select('week')
    .eq('user_id', USER_ID)
    .eq('current_week', true)
    .limit(1);
  if (gpErr) throw new Error(`game_preview: ${gpErr.message}`);
  const week = resolveWeek(gpRows?.[0]?.week ?? 0);

  return { season, week, bucket: `${USER_ID}-${DYNASTY_ID}-season_${season}` };
}

// Filename for a given upload slot, at the current week — the Upload tab
// never constructs this itself, it always asks this function.
export function buildFileName(slot: ScreenType, week: number): string {
  return `w${week}_${slot}.png`;
}
