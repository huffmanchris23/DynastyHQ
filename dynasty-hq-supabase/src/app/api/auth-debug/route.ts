import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createAuthClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Temporary sign-in diagnostic. Reports ONLY yes/no facts and counts — no tokens,
// no emails, no cookie values. Remove once sign-in is confirmed working.
export async function GET() {
  const names = cookies().getAll().map((c) => c.name);
  const { data, error } = await createAuthClient().auth.getUser();
  return NextResponse.json({
    signedIn: !!data.user,
    getUserError: error ? error.message : null,
    authCookieCount: names.filter((n) => n.startsWith('sb-') && n.includes('auth-token') && !n.includes('code-verifier')).length,
    hasCodeVerifierCookie: names.some((n) => n.includes('code-verifier')),
    hasNextCookie: names.includes('dhq_next'),
    envUrlSet: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    envAnonSet: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });
}
