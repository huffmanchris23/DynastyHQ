'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getBrowserSupabase } from '@/lib/supabase/client';

// Invite link landing: sign in if needed, redeem the code, then go claim a team.
export default function JoinPage() {
  const { code } = useParams<{ code: string }>();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await getBrowserSupabase().auth.getUser();
      if (!data.user) return router.replace(`/login?next=${encodeURIComponent(`/join/${code}`)}`);
      const res = await fetch('/api/join', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) return setError(body.error || 'Could not join.');
      window.location.replace('/');
    })();
  }, [code, router]);

  return (
    <div className="gate-wrap">
      <div className="gate-card">
        {error ? (
          <>
            <h2>Could not join</h2>
            <div className="gate-error">{error}</div>
            <a className="gate-link" href="/">Back to Dynasty HQ</a>
          </>
        ) : (
          <div className="loading-screen" style={{ height: 'auto', padding: 24 }}>
            <div className="spinner" />
            <div className="loading-text">Joining dynasty…</div>
          </div>
        )}
      </div>
    </div>
  );
}
