/**
 * Server-side auth + dynasty helpers shared by the step-2 API routes.
 * Identity comes from the signed-in cookie session; ALL authorization
 * (membership, commish role, team rules) is checked here in code, because
 * data access below uses the service-role client.
 */
import { NextResponse } from 'next/server';
import { createAuthClient } from './supabase/server';
import { getSupabase } from './supabaseClient';

export const ACTIVE_COOKIE = 'dhq_dynasty';

export async function getUser() {
  const { data } = await createAuthClient().auth.getUser();
  return data.user || null;
}

export function unauthorized() {
  return NextResponse.json({ error: 'Sign in required.' }, { status: 401 });
}

export function fail(status: number, error: string) {
  return NextResponse.json({ error }, { status });
}

export async function getMember(dynastyId: string, userId: string) {
  const { data } = await getSupabase()
    .from('dynasty_members')
    .select('*')
    .eq('dynasty_id', dynastyId)
    .eq('user_id', userId)
    .neq('status', 'removed')
    .maybeSingle();
  return data as any | null;
}

export async function getDynasty(id: string) {
  const { data } = await getSupabase().from('dynasties').select('*').eq('id', id).maybeSingle();
  return data as any | null;
}

export function isCommish(member: any): boolean {
  return !!member && (member.role === 'commish' || member.role === 'co_commish') && member.status === 'active';
}

export function setActiveCookie(res: NextResponse, dynastyId: string) {
  res.cookies.set(ACTIVE_COOKIE, dynastyId, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
    secure: process.env.NODE_ENV === 'production',
  });
  return res;
}
