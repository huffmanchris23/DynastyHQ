/**
 * ============================ BROADCAST ENGINE ============================
 * Deterministic network-assignment calculator. Runs once per "Process
 * Week" batch (from ocr-process/route.ts's runBroadcastEngine) across the
 * WHOLE week's slate at once — best_matchups' 5 games plus Mr. Huffman's
 * own game_preview game, if it's filled in — because network picks depend
 * on which other games share a time slot, not just on one game in
 * isolation.
 *
 * Rules (confirmed with Chris):
 *   - NBC: any Notre Dame game, home or away.
 *   - FOX: favors Big Ten games.
 *   - CBS: favors SEC games.
 *   - ESPN / ABC: neutral, take anything left over (ABC gets first pick of
 *     the leftovers, matching how ABC usually carries the biggest game of
 *     a window in real broadcast contracts, ESPN the next tier down).
 *   - Games are grouped into time-of-day buckets first; only games in the
 *     SAME bucket compete for the same network, since a network can't
 *     air two different games at once.
 *   - Tie-break when two games in the same bucket both qualify for the
 *     same network: the one with the higher combined (home + away)
 *     overall rating wins it.
 *   - Overflow beyond ESPN/ABC/FOX/CBS/NBC in one bucket spills to
 *     ESPN2, then ESPN+, best remaining game first. Beyond that
 *     (shouldn't happen with this league's game count) falls back to
 *     'TBD'. FS1 and ESPNU are deliberately not used.
 */

export interface SlateTeam {
  name: string;
  overall: number;
  conference: string | null;
}

export interface SlateGame {
  /** "table:id", e.g. "best_matchups:7" — lets the caller write results back. */
  id: string;
  homeTeam: SlateTeam;
  awayTeam: SlateTeam;
  /** Raw kickoff time as stored, e.g. "7:30 PM ET" or "7:30 PM". */
  time: string | null;
}

export interface BroadcastAssignment {
  id: string;
  broadcast: string;
}

const FALLBACK_NETWORKS = ['ABC', 'ESPN', 'ESPN2', 'ESPN+'];

function combinedRating(g: SlateGame): number {
  return g.homeTeam.overall + g.awayTeam.overall;
}

function isConference(team: SlateTeam, conference: string): boolean {
  return (team.conference || '').toLowerCase() === conference.toLowerCase();
}

function isNotreDame(team: SlateTeam): boolean {
  return team.name === 'Notre Dame';
}

// Parses "7:30 PM ET" / "7:30 PM" / "10:00 PM" into minutes-since-midnight
// (24h). Returns null for anything unparseable, which its own bucket.
function parseTimeToMinutes(time: string | null): number | null {
  if (!time) return null;
  const m = /(\d{1,2}):(\d{2})\s*(AM|PM)/i.exec(time);
  if (!m) return null;
  let hour = parseInt(m[1], 10) % 12;
  if (/PM/i.test(m[3])) hour += 12;
  return hour * 60 + parseInt(m[2], 10);
}

// Real CFB broadcast windows, roughly: Noon, Afternoon (3:30ish), Evening
// (6-7ish), Primetime (8-9ish), Late (10:30+). Anything with no readable
// time groups together in its own "unknown" bucket so it doesn't falsely
// compete with — or falsely avoid competing with — a real time slot.
function timeBucket(time: string | null): string {
  const minutes = parseTimeToMinutes(time);
  if (minutes == null) return 'unknown';
  if (minutes < 14 * 60) return 'noon'; // before 2:00 PM
  if (minutes < 18 * 60) return 'afternoon'; // 2:00–5:59 PM
  if (minutes < 21 * 60) return 'evening'; // 6:00–8:59 PM
  return 'night'; // 9:00 PM+
}

export function assignBroadcasts(games: SlateGame[]): BroadcastAssignment[] {
  const results: Record<string, string> = {};

  const buckets = new Map<string, SlateGame[]>();
  for (const g of games) {
    const b = timeBucket(g.time);
    if (!buckets.has(b)) buckets.set(b, []);
    buckets.get(b)!.push(g);
  }

  for (const bucketGames of buckets.values()) {
    const remaining = [...bucketGames];

    const takeBest = (predicate: (g: SlateGame) => boolean): SlateGame | null => {
      const candidates = remaining.filter(predicate);
      if (candidates.length === 0) return null;
      candidates.sort((a, b) => combinedRating(b) - combinedRating(a));
      return candidates[0];
    };

    const assign = (game: SlateGame | null, network: string) => {
      if (!game) return;
      results[game.id] = network;
      remaining.splice(remaining.indexOf(game), 1);
    };

    assign(takeBest((g) => isNotreDame(g.homeTeam) || isNotreDame(g.awayTeam)), 'NBC');
    assign(takeBest((g) => isConference(g.homeTeam, 'Big Ten') || isConference(g.awayTeam, 'Big Ten')), 'FOX');
    assign(takeBest((g) => isConference(g.homeTeam, 'SEC') || isConference(g.awayTeam, 'SEC')), 'CBS');

    // ABC/ESPN are "this is a genuinely big remaining game" slots. Mr.
    // Huffman's own game_preview game is realistically never a
    // national-broadcast game — not just relative to other games sharing
    // its time slot, but even when it has NO competition there at all. So
    // it's assigned separately from the ABC/ESPN/ESPN2/ESPN+ pool: real
    // best_matchups games fill that pool by rating as before, and the
    // game_preview game (if present) is pulled out first and only ever
    // gets ESPN+, falling back to ESPN2 if ESPN+ is already taken by
    // another game in the same time slot.
    const previewGame = remaining.find((g) => g.id.startsWith('game_preview:')) || null;
    const matchupGames = remaining.filter((g) => g !== previewGame);
    matchupGames.sort((a, b) => combinedRating(b) - combinedRating(a));
    matchupGames.forEach((g, i) => {
      results[g.id] = FALLBACK_NETWORKS[i] ?? 'TBD';
    });
    if (previewGame) {
      const used = new Set(matchupGames.map((g) => results[g.id]));
      results[previewGame.id] = ['ESPN+', 'ESPN2'].find((n) => !used.has(n)) ?? 'TBD';
    }
  }

  return games.map((g) => ({ id: g.id, broadcast: results[g.id] ?? 'TBD' }));
}
