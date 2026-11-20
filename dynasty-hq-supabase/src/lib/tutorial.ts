/**
 * Copy and example screenshots for the first-time walkthrough (components/Tutorial.tsx).
 * Example images live in the public Supabase bucket "Screenshot_Examples".
 */

const BUCKET = 'Screenshot_Examples';

/** Public URL of an example screenshot (path may contain a "/" — that is a real folder in the bucket). */
export function exampleUrl(path: string): string {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  return `${base}/storage/v1/object/public/${BUCKET}/${path.split('/').map(encodeURIComponent).join('/')}`;
}

export interface TutorialShot { title: string; file: string; note?: string }
export interface TutorialStep {
  title: string;
  /** Short paragraphs / list lines shown above the screenshots. Lines starting with "• " render as bullets. */
  body: string[];
  shots?: TutorialShot[];
  /** Highlighted warning box. */
  warn?: string;
}

const SCHEDULE: TutorialShot[] = [
  { title: 'Team Schedule (1 of 2)', file: 'Team Schedule 1/2.JPG', note: 'The first half of your season.' },
  { title: 'Team Schedule (2 of 2)', file: 'Team Schedule 2/2.JPG', note: 'Scroll down for the second half.' },
];

const CAPTURE: TutorialStep = {
  title: 'Getting your screenshots',
  body: [
    '1. On your console, take a screenshot of each screen you need.',
    "2. Send them to your phone with your console's companion app (the PlayStation App on PS5).",
    '3. Come back here and upload them from your phone.',
    "Don't crop or edit anything. Dynasty HQ crops each screenshot for you.",
  ],
};

const KEEP_OPEN: TutorialStep = {
  title: 'While it processes',
  body: [
    'After you upload, tap Process. Dynasty HQ reads each screenshot, which takes a little while.',
    'Tip: on iPhone you can set Settings > Display & Brightness > Auto-Lock to Never until it finishes.',
  ],
  warn: "Keep this screen open until it says it's done. Don't leave the app, switch tabs, or let your phone go to sleep, or processing can stop halfway.",
};

export const MEMBER_STEPS: TutorialStep[] = [
  {
    title: 'Welcome, coach',
    body: [
      'Dynasty HQ tracks your whole dynasty. Each week you upload a few screenshots from the game and everyone sees the results here.',
      'Your commissioner starts each week and publishes it once everyone has uploaded. Here is how it works.',
    ],
  },
  CAPTURE,
  {
    title: 'Your screens each week',
    body: [
      'Open each screen in the game and screenshot it. The menu name is at the top of every screen.',
      '• Team Schedule, both screenshots',
      '• Conference Standings',
      '• Team Stats: Offense and Defense. Scroll so your team is on screen. (Not in Week 0.)',
    ],
    shots: [
      ...SCHEDULE,
      { title: 'Conference Standings', file: 'Conference Standings.JPG' },
      { title: 'Team Stats: Offense', file: 'Team Stats - Offense.JPG', note: 'Make sure your team is visible.' },
      { title: 'Team Stats: Defense', file: 'Team Stats - Defense.JPG', note: 'Make sure your team is visible.' },
    ],
  },
  KEEP_OPEN,
  {
    title: "You're set",
    body: [
      'Once you are marked Ready, your commissioner can publish the week and everything unlocks for the whole dynasty.',
      'Turn on phone alerts from the bell at the top and you will be told when the week goes live and who you play.',
      'You can replay this guide any time from Help > Tips & Tricks.',
    ],
  },
];

export const COMMISH_STEPS: TutorialStep[] = [
  {
    title: 'Welcome, commissioner',
    body: [
      'You run the weekly cycle:',
      '• Open the week',
      '• Upload and process your screens (coaches add theirs)',
      '• Advance & Go Live. This is when everyone sees the new week.',
      "Coaches can upload any time while a week is open, but nothing shows for them until you advance.",
    ],
  },
  CAPTURE,
  {
    title: 'Pick your starting week',
    body: [
      'Go to Community > Weekly Uploads, tap the week your dynasty is on (weeks start at 0), then tap Open Week.',
      'After that, each week you tap Open Next Week.',
    ],
  },
  {
    title: 'Every week: team screens',
    body: [
      'You upload these same screens as your coaches do, for your own team. The menu name is at the top of every screen.',
      '• Team Schedule, both screenshots',
      '• Conference Standings',
      '• Team Stats: Offense and Defense. These are not used in Week 0.',
      'For stats, check the top 5 teams on the first screenshot. If your team is not in it, add the second one with your team.',
    ],
    shots: [
      ...SCHEDULE,
      { title: 'Conference Standings', file: 'Conference Standings.JPG' },
      { title: 'Team Stats: Offense', file: 'Team Stats - Offense.JPG' },
      { title: 'Team Stats: Defense', file: 'Team Stats - Defense.JPG' },
    ],
  },
  {
    title: 'Every week: league screens',
    body: [
      'These cover the whole league and are only uploaded by you.',
      '• Top 25',
      "• Last Week's Results: the Scores screen turned back to the previous week so it shows final scores",
      '• Best Matchups: 5 screenshots, one per game. Select each game so its detail panel (records, time, location) shows on the right.',
      '• Coaching Hot Seats (top 5)',
      '• Heisman Watch',
    ],
    shots: [
      { title: 'Top 25', file: 'Top 25.JPG' },
      { title: "Last Week's Results", file: 'Last Week Results.JPG' },
      { title: 'Best Matchups', file: 'Best Matchups.JPG', note: 'One screenshot for each of the 5 games, with the detail panel showing.' },
      { title: 'Coaching Hot Seats', file: 'Coaching Hotseats.JPG' },
      { title: 'Heisman Watch', file: 'Heisman.JPG' },
    ],
  },
  KEEP_OPEN,
  {
    title: 'Advance & Go Live',
    body: [
      'The Who is ready list shows which coaches have finished. You will get a phone alert when the last one is done.',
      'Tap Advance & Go Live to publish the week to everyone and start the countdown.',
      'You can replay this guide any time from Help > Tips & Tricks.',
    ],
  },
];
