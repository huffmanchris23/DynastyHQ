/**
 * ============================== GATING ==============================
 * Direct port of gateInfo()/tabLocked()/subtabLockedIds() from
 * JavaScript.html. Fail-safe behavior preserved verbatim: if
 * settings.currentWeek isn't present, gating is skipped entirely
 * (treated as week 999 → everything unlocked).
 */

import type { DashboardData } from './types';

export interface GateInfo {
  week: number;
  isLocked: boolean;
  statsUnlocked: boolean;
  playoffsUnlocked: boolean;
  awardsAdvUnlocked: boolean;
  heismanUnlocked: boolean;
  hotSeatUnlocked: boolean;
}

export interface TabDef {
  id: string;
  label: string;
  subtabs?: { id: string; label: string }[];
}

export const TABS: TabDef[] = [
  { id: 'home', label: 'Home' },
  { id: 'schedule', label: 'Schedule', subtabs: [{ id: 'team', label: 'Team' }, { id: 'top25', label: 'Top 25' }] },
  { id: 'rankings', label: 'Rankings', subtabs: [{ id: 'ap', label: 'AP' }, { id: 'coaches', label: 'Coaches' }] },
  { id: 'conference', label: 'Conference' },
  { id: 'playoffs', label: 'Playoffs', subtabs: [{ id: 'top25', label: 'Top 25' }, { id: 'bracket', label: 'Bracket' }] },
  { id: 'stats', label: 'Stats', subtabs: [{ id: 'team', label: 'Team' }, { id: 'player', label: 'Player' }] },
  { id: 'roster', label: 'Roster', subtabs: [{ id: 'depth', label: 'Depth Charts' }, { id: 'recruiting', label: 'Recruiting' }] },
  { id: 'awards', label: 'Awards', subtabs: [{ id: 'heisman', label: 'Heisman' }, { id: 'coordinator', label: 'Coordinator' }, { id: 'coach', label: 'Coach' }] },
  { id: 'coachingcorner', label: 'Coaching Corner', subtabs: [{ id: 'mycoach', label: 'My Coach' }, { id: 'hotseat', label: 'Hot Seats' }] },
  {
    id: 'commissioner', label: 'Commissioner', subtabs: [
      { id: 'upload', label: 'Upload' },
      { id: 'settings', label: 'Settings' },
      { id: 'scheduleassistant', label: 'Schedule Assistant' },
      { id: 'leaguehistory', label: 'League History' },
    ],
  },
  {
    id: 'community', label: 'Community', subtabs: [
      { id: 'guides', label: 'Dynasty Guides' },
      { id: 'messageboard', label: 'Message Board' },
      { id: 'announcements', label: 'Announcements' },
      { id: 'contact', label: 'Contact' },
    ],
  },
];

/**
 * MVP-scope gate, separate from week-based gating above. These are
 * permanently parked behind "Coming Soon" for now to cut OCR scope from
 * ~30 screenshots/week down to 9-11 — not tied to week number or data
 * presence, just a flat on/off per tab or subtab until built out.
 */
export const COMING_SOON_TABS: string[] = ['commissioner', 'community', 'conference', 'awards'];

export const COMING_SOON_SUBTABS: Record<string, string[]> = {
  awards: ['heisman', 'coordinator', 'coach'],
  coachingcorner: ['hotseat'],
  roster: ['recruiting'],
  stats: ['player'],
  schedule: ['top25'],
};

export function isComingSoonTab(tabId: string): boolean {
  return COMING_SOON_TABS.indexOf(tabId) > -1;
}

export function comingSoonSubtabIds(tabId: string): string[] {
  return COMING_SOON_SUBTABS[tabId] || [];
}

export function isComingSoonSubtab(tabId: string, subtabId: string | null): boolean {
  if (!subtabId) return false;
  return comingSoonSubtabIds(tabId).indexOf(subtabId) > -1;
}

export const PRESETS = [
  { name: 'Crimson & Gray', primary: '#7A2426', secondary: '#C9962E' },
  { name: 'Navy & Gold', primary: '#12233F', secondary: '#D9B34F' },
  { name: 'Forest & White', primary: '#0F2318', secondary: '#E3E3E3' },
  { name: 'Scarlet & Black', primary: '#8C1D22', secondary: '#E3E3E3' },
  { name: 'Royal & Orange', primary: '#152D63', secondary: '#D9852E' },
  { name: 'Purple & Gold', primary: '#3A2560', secondary: '#D9B34F' },
];

export function gateInfo(data: DashboardData | null): GateInfo {
  const s = (data && data.settings) || {};
  const hasWeekData = s.currentWeek !== undefined && s.currentWeek !== null && s.currentWeek !== '';
  const week = hasWeekData ? Number(s.currentWeek) || 0 : 999;
  const awards = (data && data.awards) || { heisman: [], coordinator: [], coach: [] };
  const coach = (data && data.coach) || { hotSeats: [], moves: [] };
  return {
    week,
    isLocked: hasWeekData ? week === 0 : false,
    statsUnlocked: hasWeekData ? week >= 1 : true,
    playoffsUnlocked: hasWeekData ? week >= 10 : true,
    // Coordinator/Coach awards, Heisman, and Hot Seats aren't tied to a fixed
    // week — they simply show up once the corresponding Supabase table
    // actually has rows for the current season/week. No more guessing a
    // week number.
    awardsAdvUnlocked: (awards.coordinator && awards.coordinator.length > 0) || (awards.coach && awards.coach.length > 0),
    heismanUnlocked: !!(awards.heisman && awards.heisman.length > 0),
    hotSeatUnlocked: !!(coach.hotSeats && coach.hotSeats.length > 0),
  };
}

export function tabLocked(t: TabDef, g: GateInfo): boolean {
  if (t.id === 'playoffs') return !g.playoffsUnlocked;
  if (t.id === 'stats') return !g.statsUnlocked;
  if (t.id === 'roster') return g.isLocked;
  return false;
}

export function subtabLockedIds(tabId: string, g: GateInfo): string[] {
  if (tabId === 'coachingcorner') return g.hotSeatUnlocked ? [] : ['hotseat'];
  if (tabId === 'awards') {
    const locked: string[] = [];
    if (!g.heismanUnlocked) locked.push('heisman');
    if (!g.awardsAdvUnlocked) locked.push('coordinator', 'coach');
    return locked;
  }
  return [];
}
