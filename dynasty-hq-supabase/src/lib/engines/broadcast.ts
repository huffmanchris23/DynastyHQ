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
 *   - NBC: any Notre Dame game, home or away — most exclusive, assigned
 *     first.
 *   - Each major conference has a PAIR of preferred networks, not one
 *     fixed network, so a conference isn't stuck on the same channel
 *     every week when it has more than one game in a slot:
 *       Big Ten -> FOX, ABC
 *       SEC     -> CBS, ESPN
 *       Big 12  -> FOX, ESPN
 *       ACC     -> ESPN, ABC
 *     Conferences are resolved in that order (Big Ten, SEC, Big 12, ACC)
 *     when a cross-conference game could match more than one. Within one
 *     conference's games in a bucket, the pair alternates by rating order
 *     (best game gets the pair's first network, next gets the second,
 *     cycling from there) — real variety instead of always defaulting to
 *     the first network. If a preferred network is already claimed in
 *     that bucket, the other half of the pair is tried before giving up
 *     on a conference pick for that game.
 *   - ABC / ESPN also double as the generic "big remaining game" slots
 *     for anything left after NBC + conference picks (ABC first, matching
 *     how ABC usually carries the biggest game of a window in real
 *     broadcast contracts), so they can be used twice in different roles
 *     across a whole week without ever double-booking the SAME bucket.
 *   - Games are grouped into time-of-day buckets first; only games in the
 *     SAME bucket compete for a network, since a network can't air two
 *     different games at once.
 *   - Tie-break / ordering within any pool: higher combined (home + away)
 *     overall rating goes first.
 *   - Overflow beyond ABC/ESPN in the generic pool spills to ESPN2, then
 *     ESPN+, best remaining game first. Beyond that (shouldn't happen
 *     with this league's game count) falls back to 'TBD'. FS1 and ESPNU
 *     are deliberately not used.
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

const CONFERENCE_NETWORKS: Record<string, [string, string]> = {
  'Big Ten': ['FOX', 'ABC'],
  'SEC': ['CBS', 'ESPN'],
  'Big 12': ['FOX', 'ESPN'],
  'ACC': ['ESPN', 'ABC'],
};
const CONFERENCE_PRIORITY = ['Big Ten', 'SEC', 'Big 12', 'ACC'];
const GENERIC_FALLBACK = ['ABC', 'ESPN', 'ESPN2', 'ESPN+'];

function combinedRating(g: SlateGame): number {
  return g.homeTeam.overall + g.awayTeam.overall;
}

function isConference(team: SlateTeam, conference: string): boolean {
  return (team.conference || '').toLowerCase() === conference.toLowerCase();
}

function gameConference(g: SlateGame, conference: string): boolean {
  return isConference(g.homeTeam, conference) || isConference(g.awayTeam, conference);
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
    let remaining = [...bucketGames];
    const usedNetworks = new Set<string>();

    const assign = (game: SlateGame, network: string) => {
      results[game.id] = network;
      usedNetworks.add(network);
      remaining = remaining.filter((g) => g !== game);
    };

    // NBC — most exclusive, goes first regardless of conference.
    const ndCandidates = remaining.filter((g) => isNotreDame(g.homeTeam) || isNotreDame(g.awayTeam));
    ndCandidates.sort((a, b) => combinedRating(b) - combinedRating(a));
    if (ndCandidates[0]) assign(ndCandidates[0], 'NBC');

    // Conference pairs, in priority order, alternating each conference's
    // own two games (if more than one) between its two networks.
    for (const conf of CONFERENCE_PRIORITY) {
      const [netA, netB] = CONFERENCE_NETWORKS[conf];
      const confGames = remaining.filter((g) => gameConference(g, conf));
      confGames.sort((a, b) => combinedRating(b) - combinedRating(a));
      confGames.forEach((g, i) => {
        const preferred = i % 2 === 0 ? netA : netB;
        const alternate = i % 2 === 0 ? netB : netA;
        const network = !usedNetworks.has(preferred) ? preferred : !usedNetworks.has(alternate) ? alternate : null;
        if (network) assign(g, network);
      });
    }

    // Generic fallback: ABC/ESPN also serve as "this is the biggest
    // remaining game" slots on top of their conference role, then
    // ESPN2/ESPN+ for anything past that. Mr. Huffman's own game_preview
    // game is pulled out first and restricted to ESPN+/ESPN2 only — it's
    // realistically never a national-broadcast game regardless of rating
    // or how much competition it has (or doesn't have) in its slot.
    const previewGame = remaining.find((g) => g.id.startsWith('game_preview:')) || null;
    const matchupGames = remaining.filter((g) => g !== previewGame);
    matchupGames.sort((a, b) => combinedRating(b) - combinedRating(a));
    matchupGames.forEach((g) => {
      const network = GENERIC_FALLBACK.find((n) => !usedNetworks.has(n));
      if (network) assign(g, network);
    });
    if (previewGame) {
      const network = ['ESPN+', 'ESPN2'].find((n) => !usedNetworks.has(n));
      results[previewGame.id] = network ?? 'TBD';
    }
  }

  return games.map((g) => ({ id: g.id, broadcast: results[g.id] ?? 'TBD' }));
}
