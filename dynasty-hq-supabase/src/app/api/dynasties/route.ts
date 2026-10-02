import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabaseClient';
import { fail, getUser, setActiveCookie, unauthorized } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Create a dynasty. The caller becomes commish (a DB trigger adds the
// membership + rules row). Team is claimed on the next screen.
export async function POST(req: NextRequest) {
  const user = await getUser();
  if (!user) return unauthorized();
  const body = await req.json().catch(() => ({}));

  const name = String(body.name || '').trim();
  if (name.length < 2 || name.length > 60) return fail(400, 'Give the dynasty a name (2-60 characters).');
  const mode = body.mode === 'multi' ? 'multi' : 'solo';

  const sb = getSupabase();
  // Safety net in case the signup trigger didn't create a profile row.
  await sb.from('profiles').upsert({ id: user.id, display_name: (user.email || '').split('@')[0] }, { onConflict: 'id', ignoreDuplicates: true });

  const pool = body.team_pool && typeof body.team_pool === 'object' ? body.team_pool : {};
  const { data, error } = await sb
    .from('dynasties')
    .insert({
      name,
      commish_id: user.id,
      mode,
      allow_pick: body.allow_pick !== false,
      allow_random: body.allow_random !== false,
      reroll_limit: Math.max(0, Math.min(10, Number(body.reroll_limit) || 0)),
      team_pool: {
        conferences: Array.isArray(pool.conferences) ? pool.conferences.map(String) : [],
        min_overall: pool.min_overall === '' || pool.min_overall == null ? null : Number(pool.min_overall),
        max_overall: pool.max_overall === '' || pool.max_overall == null ? null : Number(pool.max_overall),
        teams: Array.isArray(pool.teams) ? pool.teams.map(String) : [],
      },
    })
    .select('id')
    .single();
  if (error || !data) return fail(500, error?.message || 'Could not create the dynasty.');

  // Theme/settings row the dashboard reads (colors and logos fall back to defaults when null).
  await sb.from('settings').insert({ dynasty_id: data.id, user_id: user.id, current_season: 1 });

  return setActiveCookie(NextResponse.json({ id: data.id }), data.id);
}
