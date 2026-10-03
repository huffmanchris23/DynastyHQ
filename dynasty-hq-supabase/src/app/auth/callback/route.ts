import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createAuthClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Google sign-in lands here with ?code=... — swap it for a session cookie.
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const rawNext = cookies().get('dhq_next')?.value ? decodeURIComponent(cookies().get('dhq_next')!.value) : url.searchParams.get('next') || '/';
  const next = rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/';

  let reason = 'no_code';
  if (code) {
    const { error } = await createAuthClient().auth.exchangeCodeForSession(code);
    if (!error) {
      const res = NextResponse.redirect(new URL(next, url.origin));
      res.cookies.set('dhq_next', '', { path: '/', maxAge: 0 });
      return res;
    }
    reason = error.message || 'exchange_failed';
    console.error('[auth/callback] exchangeCodeForSession failed:', reason);
  } else {
    console.error('[auth/callback] reached without a code. Params:', Array.from(url.searchParams.keys()).join(','));
  }
  return NextResponse.redirect(new URL(`/login?error=signin&reason=${encodeURIComponent(reason.slice(0, 160))}`, url.origin));
}
