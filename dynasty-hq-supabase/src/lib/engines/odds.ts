/**
 * ============================== ODDS ENGINE ==============================
 * Deterministic spread / moneyline / over-under calculator. No LLM
 * involved here — ocr-process/route.ts calls this after OCR has written
 * the raw matchup fields (teams, ranks, records, connector, location) to
 * best_matchups; this module turns those raw fields plus ocr_helper
 * ratings into a betting line.
 *
 * Formula (confirmed with Chris — see project notes for the back-and-forth
 * that landed here):
 *   power rating = 0.5*overall + 0.3*offense + 0.3*defense
 *   record nudge = (winPct(home-field team) - winPct(other team)) * 4
 *   diff, computed from the EFFECTIVE home-field team's own perspective
 *   (not necessarily the screen's "home slot" team — see resolveHomeField
 *   below) = (homeFieldTeam.power - otherTeam.power) + record nudge
 *   tiered home-field bonus, added on the home-field team's side only:
 *     diff >= 7   -> +3  ("already a big favorite")
 *     diff <= -7  -> +1  ("major underdog")
 *     otherwise   -> +2  ("close")
 *   nonlinear scale: sign(diff) * |diff|^1.25, bonus added after scaling —
 *   a plain linear diff produced spreads that were too small for real
 *   blowouts (validated against a real -34.5 line already on file for USC
 *   vs San Jose State, which this formula independently reproduces at
 *   -34.0 without ever seeing that number).
 *   Neutral-site games skip the home-field bonus entirely (bonus = 0) and
 *   use the screen's home_team as the sign reference instead.
 *   Spread always rounds to the nearest 0.5. Moneyline comes from a
 *   standard sportsbook spread table, not a raw probability conversion.
 */

export interface TeamRatingInput {
  name: string;
  overall: number;
  offense: number;
  defense: number;
  /** 2-letter state code from ocr_helper.home_state, or null if unknown. */
  homeState: string | null;
}

export interface MatchupInput {
  /** Team in the screen's home slot (bottom of the detail panel). */
  homeTeam: TeamRatingInput;
  /** Team in the screen's away slot (top of the detail panel). */
  awayTeam: TeamRatingInput;
  /** The grid row's own connector text, uppercased: "AT" or "VS". */
  connector: string | null;
  /** e.g. "Baton Rouge, LA" — last comma-separated segment must be the state. */
  gameLocation: string | null;
  homeWins: number;
  homeLosses: number;
  awayWins: number;
  awayLosses: number;
}

export interface MatchupOdds {
  isNeutralSite: boolean;
  /** Name of the team that gets the home-field bonus, or null if neutral. */
  homeFieldTeam: string | null;
  favorite: string;
  /** Always <= 0 — the favorite's points, e.g. -7.0. */
  spread: number;
  favoriteWinProbability: string;
  favoriteMoneyline: string;
  totalOverUnder: string;
}

function powerRating(t: TeamRatingInput): number {
  return 0.5 * t.overall + 0.3 * t.offense + 0.3 * t.defense;
}

function winPct(wins: number, losses: number): number {
  const games = (wins || 0) + (losses || 0);
  return games === 0 ? 0.5 : wins / games;
}

function roundToHalf(n: number): number {
  return Math.round(n * 2) / 2;
}

// Extracts a 2-letter state code from the last comma-separated segment of
// a "City, ST" location string. Returns null if it doesn't look like one
// (including when gameLocation itself is null/blank, which the OCR guide
// says happens on some screens).
function stateFromLocation(location: string | null): string | null {
  if (!location) return null;
  const parts = location.split(',');
  const last = (parts[parts.length - 1] || '').trim().toUpperCase();
  return /^[A-Z]{2}$/.test(last) ? last : null;
}

// Standard sportsbook spread -> moneyline chart, 0 to 20 in half-point
// steps (favorite ML, underdog ML). There's no standard published chart
// beyond 20 points, so it's extrapolated past that using the growth rate
// of the table's last segment.
const ML_TABLE: Record<string, [number, number]> = {
  '0': [-110, 110], '0.5': [-120, 100], '1': [-130, 110], '1.5': [-140, 120],
  '2': [-150, 130], '2.5': [-160, 140], '3': [-175, 155], '3.5': [-190, 160],
  '4': [-200, 170], '4.5': [-210, 180], '5': [-220, 190], '5.5': [-230, 200],
  '6': [-240, 210], '6.5': [-250, 220], '7': [-270, 230], '7.5': [-280, 240],
  '8': [-290, 250], '8.5': [-300, 260], '9': [-320, 270], '9.5': [-340, 280],
  '10': [-360, 300], '10.5': [-380, 310], '11': [-400, 320], '11.5': [-420, 330],
  '12': [-450, 350], '12.5': [-470, 360], '13': [-500, 380], '13.5': [-550, 400],
  '14': [-600, 425], '14.5': [-650, 450], '15': [-700, 475], '15.5': [-750, 500],
  '16': [-800, 525], '16.5': [-850, 550], '17': [-900, 575], '17.5': [-950, 600],
  '18': [-1000, 625], '18.5': [-1100, 650], '19': [-1200, 675], '19.5': [-1300, 700],
  '20': [-1400, 725],
};

function moneylineForSpread(absSpread: number): [number, number] {
  const key = String(roundToHalf(absSpread));
  if (ML_TABLE[key]) return ML_TABLE[key];
  if (absSpread > 20) {
    const over = absSpread - 20;
    const fav = -1400 - Math.round((over * 300) / 25) * 25; // nearest 25
    const dog = 725 + Math.round((over * 40) / 5) * 5; // nearest 5
    return [fav, dog];
  }
  return ML_TABLE['0'];
}

function winProbabilityFromSpread(absSpread: number): number {
  return 1 / (1 + Math.exp(-absSpread / 9));
}

// Resolves who actually has home-field advantage, if anyone. "AT" games
// are unambiguous. "VS" games check the game's location against each
// team's home state — the screen's home/away slot is not authoritative
// for home-field on a "VS" game (e.g. Wisconsin vs Notre Dame played at
// Green Bay, WI is effectively a Wisconsin home game even though the
// screen's home slot holds Notre Dame). No state match at all means a
// true neutral site.
function resolveHomeField(m: MatchupInput): { homeFieldTeam: TeamRatingInput | null; isNeutralSite: boolean } {
  const connector = (m.connector || '').toUpperCase();
  if (connector === 'AT') {
    return { homeFieldTeam: m.homeTeam, isNeutralSite: false };
  }
  const state = stateFromLocation(m.gameLocation);
  if (state && state === m.homeTeam.homeState) return { homeFieldTeam: m.homeTeam, isNeutralSite: false };
  if (state && state === m.awayTeam.homeState) return { homeFieldTeam: m.awayTeam, isNeutralSite: false };
  return { homeFieldTeam: null, isNeutralSite: true };
}

export function computeMatchupOdds(m: MatchupInput): MatchupOdds {
  const { homeFieldTeam, isNeutralSite } = resolveHomeField(m);

  let favorite: string;
  let spread: number;

  if (!homeFieldTeam || isNeutralSite) {
    // True neutral site — no home bonus. Diff taken from home_team's
    // perspective purely as a consistent sign convention, not because it
    // has any actual home-field edge.
    const diff =
      powerRating(m.homeTeam) -
      powerRating(m.awayTeam) +
      (winPct(m.homeWins, m.homeLosses) - winPct(m.awayWins, m.awayLosses)) * 4;
    const scaled = Math.sign(diff) * Math.pow(Math.abs(diff), 1.25);
    const rounded = roundToHalf(scaled);
    favorite = rounded >= 0 ? m.homeTeam.name : m.awayTeam.name;
    spread = -Math.abs(rounded);
  } else {
    const otherTeam = homeFieldTeam === m.homeTeam ? m.awayTeam : m.homeTeam;
    const homeFieldWins = homeFieldTeam === m.homeTeam ? m.homeWins : m.awayWins;
    const homeFieldLosses = homeFieldTeam === m.homeTeam ? m.homeLosses : m.awayLosses;
    const otherWins = homeFieldTeam === m.homeTeam ? m.awayWins : m.homeWins;
    const otherLosses = homeFieldTeam === m.homeTeam ? m.awayLosses : m.homeLosses;

    const diff =
      powerRating(homeFieldTeam) -
      powerRating(otherTeam) +
      (winPct(homeFieldWins, homeFieldLosses) - winPct(otherWins, otherLosses)) * 4;

    const bonus = diff >= 7 ? 3 : diff <= -7 ? 1 : 2;
    const scaled = Math.sign(diff) * Math.pow(Math.abs(diff), 1.25);
    const rounded = roundToHalf(scaled + bonus);

    favorite = rounded >= 0 ? homeFieldTeam.name : otherTeam.name;
    spread = -Math.abs(rounded);
  }

  const absSpread = Math.abs(spread);
  const [favMl, dogMl] = moneylineForSpread(absSpread);
  const winProb = winProbabilityFromSpread(absSpread);
  const overUnder = roundToHalf((m.homeTeam.overall + m.awayTeam.overall) * 0.33);

  return {
    isNeutralSite,
    homeFieldTeam: homeFieldTeam ? homeFieldTeam.name : null,
    favorite,
    spread,
    favoriteWinProbability: `${(winProb * 100).toFixed(1)}%`,
    favoriteMoneyline: `${favMl} / +${dogMl}`,
    totalOverUnder: overUnder.toFixed(1),
  };
}
