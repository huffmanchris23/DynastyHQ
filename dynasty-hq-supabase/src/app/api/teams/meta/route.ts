import { NextResponse } from 'next/server';
import { getUser, unauthorized } from '@/lib/auth';
import { allTeams } from '@/lib/teamPool';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Reference data for pickers: conferences, school names, and every team's conference + starting rating.
export async function GET() {
  if (!(await getUser())) return unauthorized();
  const teams = await allTeams();
  const conferences = Array.from(new Set(teams.map((t) => t.team_conference).filter(Boolean) as string[])).sort();
  return NextResponse.json({
    conferences,
    schools: teams.map((t) => t.team_name).sort(),
    teams: teams.map((t) => ({ name: t.team_name, conference: t.team_conference, overall: t.team_overall })),
  });
}
