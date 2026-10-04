import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabaseClient';
import { fail, getUser, unauthorized } from '@/lib/auth';
import { getDynastyCtx } from '@/lib/dynastyContext';
import { AVATARS } from '@/lib/avatars';
import { DEFENSE_PLAYBOOKS, OFFENSE_PLAYBOOKS, PHILOSOPHIES, PIPELINES } from '@/lib/coachOptions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Current coach profile (this season's my_coach row) for the signed-in member.
export async function GET() {
  const user = await getUser();
  if (!user) return unauthorized();
  const c = await getDynastyCtx(user.id);
  if (!c) return fail(409, 'Join a dynasty first.');
  const { data } = await getSupabase().from('my_coach').select('*').eq('dynasty_id', c.dynastyId).eq('user_id', user.id).eq('season', c.season).maybeSingle();
  return NextResponse.json({
    coach: data
      ? {
          name: data.name, avatar: Number(String(data.image_url || '').replace('avatar:', '')) || null,
          almaMater: data.alma_mater, pipeline: data.recruiting_pipeline,
          offense: data.offense, defense: data.defense, philosophy: data.coaching_philosophy,
        }
      : null,
    options: { offense: OFFENSE_PLAYBOOKS, defense: DEFENSE_PLAYBOOKS, pipelines: PIPELINES, philosophies: PHILOSOPHIES },
  });
}

// Create/update this season's coach profile. Every choice is validated against a list.
export async function POST(req: NextRequest) {
  const user = await getUser();
  if (!user) return unauthorized();
  const c = await getDynastyCtx(user.id);
  if (!c || !c.team) return fail(409, 'Pick a team first.');

  const b = await req.json().catch(() => ({}));
  const name = String(b.name || '').trim();
  if (name.length < 2 || name.length > 40) return fail(400, 'Enter your coach name (2-40 characters).');
  const avatar = Number(b.avatar);
  if (!AVATARS.some((a) => a.id === avatar)) return fail(400, 'Pick a coach.');

  const sb = getSupabase();
  const { data: schools } = await sb.from('assets').select('team_name');
  const schoolSet = new Set((schools || []).map((s: any) => s.team_name));
  const oneOf = (v: any, list: string[]) => (list.length && list.indexOf(v) > -1 ? String(v) : null);

  const row = {
    name,
    image_url: `avatar:${avatar}`,
    alma_mater: b.almaMater && schoolSet.has(b.almaMater) ? String(b.almaMater) : null,
    recruiting_pipeline: oneOf(b.pipeline, PIPELINES),
    offense: oneOf(b.offense, OFFENSE_PLAYBOOKS),
    defense: oneOf(b.defense, DEFENSE_PLAYBOOKS),
    coaching_philosophy: oneOf(b.philosophy, PHILOSOPHIES),
    team: c.team,
    title: 'Head Coach',
  };

  const { data: existing } = await sb.from('my_coach').select('id').eq('dynasty_id', c.dynastyId).eq('user_id', user.id).eq('season', c.season).maybeSingle();
  const { error } = existing
    ? await sb.from('my_coach').update(row).eq('id', existing.id)
    : await sb.from('my_coach').insert({ ...row, dynasty_id: c.dynastyId, user_id: user.id, season: c.season });
  if (error) return fail(500, error.message);
  return NextResponse.json({ ok: true });
}
