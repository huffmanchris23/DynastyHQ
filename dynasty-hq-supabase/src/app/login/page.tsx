'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { getBrowserSupabase } from '@/lib/supabase/client';

const EMAIL_LOGIN = process.env.NEXT_PUBLIC_EMAIL_LOGIN === 'on';

function safeNext(raw: string | null) {
  return raw && raw.startsWith('/') && !raw.startsWith('//') ? raw : '/';
}

function LoginInner() {
  const params = useSearchParams();
  const next = safeNext(params.get('next'));
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(params.get('error') ? 'Sign-in did not finish. Try again.' : null);

  // Already signed in (e.g. a session was created but the app bounced back here)? Go on in.
  useEffect(() => {
    getBrowserSupabase().auth.getUser().then(({ data }) => { if (data.user) window.location.replace(next); });
  }, [next]);

  async function google() {
    setError(null);
    // Remember where to go after sign-in. Kept out of the redirect URL on purpose:
    // Supabase only honors redirect URLs that match its allow-list exactly.
    document.cookie = `dhq_next=${encodeURIComponent(next)}; path=/; max-age=600; samesite=lax`;
    const { error } = await getBrowserSupabase().auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) setError(error.message);
  }

  async function sendCode() {
    setBusy(true); setError(null);
    const { error } = await getBrowserSupabase().auth.signInWithOtp({ email: email.trim(), options: { shouldCreateUser: true } });
    setBusy(false);
    if (error) return setError(error.message);
    setStep('code');
  }

  async function verify() {
    setBusy(true); setError(null);
    const { error } = await getBrowserSupabase().auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'email' });
    if (error) { setBusy(false); return setError('That code did not work. Check it and try again, or send a new one.'); }
    window.location.replace(next);
  }

  return (
    <div className="gate-wrap">
      <div className="gate-masthead">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icon-192.png" alt="" width={56} height={56} />
        <h1>Dynasty HQ</h1>
      </div>
      <div className="gate-card">
        <h2>Sign in</h2>
        <button className="gate-btn" onClick={google}>Continue with Google</button>
        {EMAIL_LOGIN ? <div className="gate-or"><span>or use your email</span></div> : null}

        {!EMAIL_LOGIN ? null : step === 'email' ? (
          <>
            <input className="gate-input" type="email" inputMode="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
            <button className="gate-btn secondary" disabled={busy || !email.includes('@')} onClick={sendCode}>Email me a code</button>
          </>
        ) : (
          <>
            <p className="gate-hint">We sent a code to {email}. Enter it here.</p>
            <input className="gate-input code" inputMode="numeric" autoComplete="one-time-code" placeholder="Code" value={code} onChange={(e) => setCode(e.target.value.replace(/\s/g, ''))} />
            <button className="gate-btn secondary" disabled={busy || code.length < 6} onClick={verify}>Sign in</button>
            <button className="gate-link" onClick={() => { setStep('email'); setCode(''); }}>Use a different email</button>
          </>
        )}
        {error ? <div className="gate-error">{error}</div> : null}
      </div>
      <p className="gate-hint" style={{ textAlign: 'center' }}>
        <a href="/privacy">Privacy</a> · <a href="/terms">Terms</a>
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginInner />
    </Suspense>
  );
}
