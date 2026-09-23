/**
 * ============================ CONTENT ENGINE ============================
 * Unlike odds.ts/broadcast.ts, this one can't be pure math — it's asking
 * Claude to actually write two home-page sections. This module only
 * builds the prompt and validates the response; the actual Anthropic API
 * call and DB read/write live in ocr-process/route.ts's
 * runContentEngine(), same split as everywhere else in this pipeline.
 *
 * Triggered once per "Process Week" batch whenever that batch included a
 * `last_week_results` screenshot (see ways-of-working notes) — pulls in
 * every other data source from that week too (Top 25, this week's biggest
 * games, Heisman race, coaching hot seats, conference standings), not
 * just the new results screenshot alone.
 */

export const DRIVE_BY_TYPE = 'Dynasty Drive-By';
export const TOP_TAKE_TYPE = 'T.B. Top 3 Take';

export interface ContentContext {
  lastWeekResults: any[];
  currentTop25: any[];
  biggestGamesThisWeek: any[];
  heismanRace: any[];
  coachingHotSeats: any[];
  conferenceStandings: any[];
  /** Every FBS team's real conference in THIS dynasty, e.g. { "Florida State": "ACC" }. Realignment can differ from real life — this is the only source of truth for it. */
  teamConferences: Record<string, string>;
}

export interface ContentItemOut {
  team: string;
  headline: string;
}

export interface ContentResult {
  driveBy: ContentItemOut[];
  topTakes: ContentItemOut[];
}

// Real examples Chris has written by hand in past weeks — these anchor the
// voice so the model doesn't drift into generic sports-blog tone. Told
// explicitly not to reuse them, just match the register/length/punch.
const DRIVE_BY_EXAMPLES = [
  'Ole Miss-Louisville game headlines Week 1 slate',
  'FSU scores 20 unanswered to win by 7 over NM State',
  'Memphis comeback make them early G6 favorite',
  'Hurricanes knocks off Irish in instant classic',
  "#3 Notre Dame hosting #6 Miami to kick off '26",
  'Ohio State leads the pack in preseason AP poll',
];

const TOP_TAKE_EXAMPLES = [
  'Florida State really, really stinks. Like really stinks.',
  'Arizona will for sure be in the Big XII title',
  'Franklin will be fired by the end of the season',
  'Oregon will claim the title in 2026 over LSU',
  "LSU will produce this year's Heisman winner",
  'Defending champs Indiana will miss Playoffs',
];

export const CONTENT_TOOL = {
  name: 'submit_weekly_content',
  description: "Submit this week's Dynasty Drive-By and T.B.'s Top 3 Takes.",
  input_schema: {
    type: 'object' as const,
    properties: {
      driveBy: {
        type: 'array' as const,
        description: 'Exactly 4 factual, ESPN-ticker-style one-liners.',
        items: {
          type: 'object' as const,
          properties: {
            team: { type: 'string' as const, description: 'The exact name of a SCHOOL/team from the data — never a player\u2019s name.' },
            headline: { type: 'string' as const, description: 'The blurb text. Avoid double-quote characters inside it — use single quotes for any quoted speech or nicknames instead.' },
          },
          required: ['team', 'headline'],
        },
        minItems: 4,
        maxItems: 4,
      },
      topTakes: {
        type: 'array' as const,
        description: 'Exactly 3 genuinely controversial, opinionated T.B. Walker takes.',
        items: {
          type: 'object' as const,
          properties: {
            team: { type: 'string' as const, description: 'The exact name of a SCHOOL/team from the data — never a player\u2019s name, even for a Heisman-focused take. If the take is about a player, use that player\u2019s team here.' },
            headline: { type: 'string' as const, description: 'The take text. Avoid double-quote characters inside it — use single quotes for any quoted speech or nicknames instead.' },
          },
          required: ['team', 'headline'],
        },
        minItems: 3,
        maxItems: 3,
      },
    },
    required: ['driveBy', 'topTakes'],
  },
};

export function buildContentSystemPrompt(context: ContentContext): string {
  return `You write two home-page sections for Dynasty HQ, a personal college football dynasty tracker. These are two DIFFERENT voices for two DIFFERENT purposes — do not blur them together.

## Dynasty Drive-By — write exactly 4
Factual, ESPN-ticker-style one-liners reporting what actually happened or is set to happen: scores, matchups, rankings, storylines from around the country. Punchy and present-tense, but NEVER opinionated — no predictions, no hot takes, no "will," no personal judgment calls. Just the facts, reported with energy. Real examples of the register (write new ones from this week's data below, do not reuse these):
${DRIVE_BY_EXAMPLES.map((e) => `- "${e}"`).join('\n')}

## T.B.'s Top 3 Takes — write exactly 3
Written in the voice of T.B. Walker, a college football hot-take pundit in the Barstool Sports mold — think Big Cat, Brandon Walker, Dave Portnoy energy: brash, casually confident to the point of arrogance, internet-sports-talk phrasing, totally comfortable being loud and a little unhinged for the sake of a bold stance. He does NOT have one fixed catchphrase or verbal tic to repeat — don't invent a running gimmick — the personality comes from the swagger and register of the writing itself, not a scripted bit. These must be genuinely controversial and opinionated — the kind of claim people would argue about. Every single one needs a bold, debatable stance: a coach getting fired, a team wildly overrated or underrated, a Heisman or playoff call, a team about to collapse or break out. If a take reads like it could run as a Drive-By instead (i.e. it's just reporting something), it's wrong — rewrite it as an actual opinion/prediction. These can run a little longer than Drive-By if the extra length is earning real personality/swagger, not padding. Real examples of the register (write new ones from this week's data below, do not reuse these):
${TOP_TAKE_EXAMPLES.map((e) => `- "${e}"`).join('\n')}

## Rules
- Base every blurb on the DATA below — never invent a score, record, name, or storyline that isn't in it.
- Never state or imply which conference a team belongs to from your own outside knowledge — conference realignment in this dynasty can differ from real life. teamConferences below is the ONLY source of truth for that; if a team isn't in it, don't make a conference claim about it at all.
- "team" must be exactly one team name from the data, copied exactly as it appears there (the team the blurb is centered on).
- When describing lastWeekResults, check home_rank/away_rank before choosing your framing. "Stuns"/"shocks"/"upsets" language is ONLY correct when the LOWER-ranked (or unranked) team beat the HIGHER-ranked one. If the ranked team won and the loser was unranked, that's an expected result, not an upset — say the ranked team "knocks off" or "handles" the unranked one, don't call it a stunner. Get the specific rank numbers right (e.g. "#20 SMU," not "unranked SMU," when away_rank is 20) — don't call a team unranked when it has a real rank in the data, and don't call a team ranked when its rank field is null.
- Drive-By headlines stay tight and ticker-like — roughly 6-12 words, matching the examples. Top Takes have more room to breathe (the home page card wraps instead of truncating) — let a take run longer than that when the extra length is real swagger/personality, not filler.
- Every one of these categories must be the basis of at least one blurb across the 7 total, full stop — last week's results, the current Top 25, this week's biggest games, the Heisman race, coaching hot seats, and conference standings. There is always something usable in each (a coach's number moved, a team's record changed, someone's Heisman odds shifted) even in a slow week — find the real angle rather than skipping a category.
- Avoid double-quote characters inside any headline — use single quotes for nicknames or quoted speech instead.
- Call the submit_weekly_content tool with your 4 driveBy items and 3 topTakes items. Don't write any of this as plain text in your reply.

DATA:
${JSON.stringify(context)}`;
}

export function parseContentResponse(toolInput: any): ContentResult {
  if (!toolInput || !Array.isArray(toolInput.driveBy) || !Array.isArray(toolInput.topTakes)) {
    throw new Error('tool input is missing driveBy/topTakes arrays');
  }

  const clean = (arr: any[]): ContentItemOut[] =>
    arr
      .filter((x) => x && typeof x.headline === 'string' && x.headline.trim() && typeof x.team === 'string' && x.team.trim())
      .map((x) => ({ team: x.team.trim(), headline: x.headline.trim() }));

  const driveBy = clean(toolInput.driveBy).slice(0, 4);
  const topTakes = clean(toolInput.topTakes).slice(0, 3);

  if (driveBy.length === 0 && topTakes.length === 0) {
    throw new Error('tool input had no usable driveBy or topTakes items');
  }

  return { driveBy, topTakes };
}
