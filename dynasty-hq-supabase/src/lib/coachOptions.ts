/**
 * Pick-lists for the coach setup screen.
 * Offense/defense: collegefootball.gg/playbooks. Pipelines: the game's list.
 * Philosophy: a coach picks exactly 3 (see PHILOSOPHY_PICKS).
 * Alma mater is built from the app's own team list.
 */
export interface OptionGroup { label: string; items: string[] }

export const OFFENSE_GROUPS: OptionGroup[] = [
  { label: 'Generic playbooks', items: ["Air Raid", "Go Go", "Multiple", "Option", "Pistol", "Power Spread", "Pro Style", "Run & Shoot", "Spread", "Spread Option", "Veer & Shoot"] },
  { label: 'Team playbooks', items: ["Air Force", "Akron", "Alabama", "Appalachian State", "Arizona", "Arizona State", "Arkansas", "Arkansas State", "Army", "Auburn", "Ball State", "Baylor", "Boise State", "Boston College", "Bowling Green", "Buffalo", "BYU", "Cal", "Central Michigan", "Charlotte", "Cincinnati", "Clemson", "Coastal Carolina", "Colorado", "Colorado State", "Delaware", "Duke", "East Carolina", "Eastern Michigan", "FIU", "Florida", "Florida Atlantic", "Florida State", "Fresno State", "Georgia", "Georgia Southern", "Georgia State", "Georgia Tech", "Hawaii", "Houston", "Illinois", "Indiana", "Iowa", "Iowa State", "Jacksonville State", "James Madison", "Kansas", "Kansas State", "Kennesaw State", "Kent State", "Kentucky", "Liberty", "Louisiana", "Louisiana Tech", "Louisville", "LSU", "Marshall", "Maryland", "Memphis", "Miami", "Miami (OH)", "Michigan", "Michigan State", "Middle Tennessee State", "Minnesota", "Mississippi State", "Missouri", "Missouri State", "Navy", "NC State", "Nebraska", "Nevada", "New Mexico", "New Mexico State", "North Carolina", "North Dakota State", "North Texas", "Northern Illinois", "Northwestern", "Notre Dame", "Ohio", "Ohio State", "Oklahoma", "Oklahoma State", "Old Dominion", "Ole Miss", "Oregon", "Oregon State", "Penn State", "Pittsburgh", "Purdue", "Rice", "Rutgers", "Sacramento State", "Sam Houston State", "San Diego State", "San Jose State", "SMU", "South Alabama", "South Carolina", "Southern Miss", "Stanford", "Syracuse", "TCU", "Temple", "Tennessee", "Texas", "Texas A&M", "Texas State", "Texas Tech", "Toledo", "Troy", "Tulane", "Tulsa", "UAB", "UCF", "UCLA", "Uconn", "UL Monroe", "UMass", "UNLV", "USC", "USF", "Utah", "Utah State", "UTEP", "UTSA", "Vanderbilt", "Virginia", "Virginia Tech", "Wake Forest", "Washington", "Washington State", "West Virginia", "Western Kentucky", "Western Michigan", "Wisconsin", "Wyoming"] },
];
export const OFFENSE_PLAYBOOKS: string[] = OFFENSE_GROUPS.flatMap((g) => g.items);

export const DEFENSE_PLAYBOOKS: string[] = ["3-2-6", "3-3-5", "3-3-5 Man", "3-3-5 Man Pressure", "3-3-5 Shell", "3-3-5 Three High", "3-3-5 Tite", "3-3-5 Zone", "3-3-5 Zone Pressure", "3-4", "3-4 Man", "3-4 Man Pressure", "3-4 Multiple", "3-4 Shell", "3-4 Zone", "3-4 Zone Pressure", "4-2-5", "4-2-5 Man", "4-2-5 Man Pressure", "4-2-5 Shell", "4-2-5 Zone", "4-2-5 Zone Pressure", "4-3", "4-3 Man", "4-3 Man Pressure", "4-3 Multiple", "4-3 Press Quarters", "4-3 Shell", "4-3 Zone", "4-3 Zone Pressure", "Multiple", "Multiple D"];

export const PIPELINES: string[] = ["East Texas", "Southern California", "North Texas", "Central Florida", "Metro Atlanta", "Tidewater", "South Florida", "Ohio", "Alabama", "North Carolina", "Louisiana", "South Georgia", "Big Apple", "Northern California", "Michigan", "Illinois", "Tennessee", "South Carolina", "Mississippi", "Pennsylvania", "Arizona", "Pacific Northwest", "North Florida", "Indiana", "Missouri", "Utah", "New England", "Oklahoma", "Colorado", "Kentucky", "Wisconsin", "Hawaii", "Southwest Texas", "Nevada", "Arkansas", "Iowa", "Kansas", "Minnesota", "Nebraska", "Big Sky", "West Virginia", "New Mexico"];

export const PHILOSOPHY_PICKS = 3;
export const PHILOSOPHIES: string[] = ["Speed", "Violence", "Discipline", "Toughness", "Aggression", "Precision", "Power", "Tempo", "Pressure", "Balance", "Creativity", "Physicality", "Culture", "Grit", "Chaos", "Control", "Innovation", "Intensity", "Fundamentals", "Swagger", "Resilience", "Adaptability", "Efficiency", "Explosiveness", "Ground and Pound", "Air It Out", "Defense First", "Player Development", "Recruiting Edge", "Underdog"];

/** Coaching role. Stored in my_coach.title as the short code (the career history table shows it as "Pos"). */
export const POSITIONS = [
  { id: 'HC', label: 'Head Coach' },
  { id: 'OC', label: 'Offensive Coordinator' },
  { id: 'DC', label: 'Defensive Coordinator' },
] as const;
export type PositionId = (typeof POSITIONS)[number]['id'];
export const POSITION_IDS: string[] = POSITIONS.map((p) => p.id);
