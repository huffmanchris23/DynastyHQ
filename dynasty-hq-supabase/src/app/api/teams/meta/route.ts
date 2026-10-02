import { NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabaseClient';
import { getUser, unauthorized } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Conference list for the commish's claim-rules picker.
export async function GET() {
  if (!(await getUser())) return unauthorized();
  const { data } = await getSupabase().from('assets').select('team_conference');
  const conferences = Array.from(new Set((data || []).map((r: any) => r.team_conference).filter(Boolean))).sort();
  return NextResponse.json({ conferences });
}
