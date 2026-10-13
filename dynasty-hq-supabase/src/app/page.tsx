'use client';

import { useCallback, useEffect, useState } from 'react';
import type { DashboardData } from '@/lib/types';
import DashboardApp from '@/components/DashboardApp';
import Onboarding from '@/components/gate/Onboarding';
import ClaimTeam from '@/components/gate/ClaimTeam';
import CoachSetup from '@/components/gate/CoachSetup';
import DynastySwitcher from '@/components/gate/DynastySwitcher';

interface Me {
  user: { id: string; email: string };
  memberships: any[];
  displayName?: string;
  active: { dynastyId: string; role: string; team: string | null; coachReady?: boolean; teamInfo?: { primary_color?: string } | null; dynasty: { name: string; mode: string } } | null;
}

export default function Page() {
  const [me, setMe] = useState<Me | null>(null);
  const [data, setData] = useState<DashboardData | null>(null);
  const [dashError, setDashError] = useState<string | null>(null);
  const [meError, setMeError] = useState(false);

  const loadMe = useCallback(async () => {
    // A failed request (server hiccup, mid-deploy, flaky connection) must NOT look like
    // "you have no dynasty": that is what used to drop people on the join/create screen.
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await fetch('/api/me');
        if (res.status === 401) { window.location.replace('/login'); return; }
        if (res.ok) { setMeError(false); setMe(await res.json()); return; }
      } catch { /* retry below */ }
      await new Promise((r) => setTimeout(r, 1200));
    }
    setMeError(true);
  }, []);

  useEffect(() => { loadMe(); }, [loadMe]);

  const ready = !!(me && me.active && me.active.team && me.active.coachReady);
  const activeId = me?.active?.dynastyId;

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    setData(null); setDashError(null);
    fetch('/api/dashboard')
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.message || 'Request failed');
        return body as DashboardData;
      })
      .then((body) => { if (!cancelled) setData(body); })
      .catch((err) => { if (!cancelled) setDashError(err.message || String(err)); });
    return () => { cancelled = true; };
  }, [ready, activeId]);

  if (!me && meError) {
    return (
      <div id="app"><div className="loading-screen">
        <div className="loading-text">Couldn&rsquo;t reach Dynasty HQ. Your dynasty is safe.</div>
        <button type="button" className="gate-chip" style={{ marginTop: 12 }} onClick={() => { setMeError(false); loadMe(); }}>Try again</button>
      </div></div>
    );
  }

  if (!me) {
    return (
      <div id="app"><div className="loading-screen"><div className="spinner" /><div className="loading-text">Loading Dynasty HQ…</div></div></div>
    );
  }

  if (!me.active) return <Onboarding onDone={loadMe} />;

  if (!me.active.team) {
    return <ClaimTeam dynastyId={me.active.dynastyId} dynastyName={me.active.dynasty.name} onDone={loadMe} />;
  }

  if (!me.active.coachReady) {
    return <CoachSetup defaultName={me.displayName} color={me.active.teamInfo?.primary_color || undefined} onDone={loadMe} />;
  }

  if (dashError) {
    // Until the dashboard is re-scoped to dynasties (build step 3), signed-in
    // members land here with a working account, dynasty, and team.
    return (
      <div id="app">
        <div className="gate-wrap">
          <div className="gate-card center">
            <h2>{me.active.dynasty.name}</h2>
            <p className="gate-hint">You are coaching {me.active.team}.</p>
            <DynastySwitcher />
            <p className="gate-hint" style={{ marginTop: 16 }}>Dashboard data is not connected to this dynasty yet.</p>
            <p className="gate-hint">{dashError}</p>
          </div>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div id="app"><div className="loading-screen"><div className="spinner" /><div className="loading-text">Loading Dynasty HQ…</div></div></div>
    );
  }

  return (
    <div id="app">
      <DashboardApp data={data} />
    </div>
  );
}
