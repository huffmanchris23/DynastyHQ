import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabaseClient';
import { fail, getUser, unauthorized } from '@/lib/auth';
import { getDynastyCtx } from '@/lib/dynastyContext';
import { DEFENSE_PLAYBOOKS, OFFENSE_GROUPS, OFFENSE_PLAYBOOKS, PHILOSOPHIES, PHILOSOPHY_PICKS, PIPELINES, POSITIONS, POSITION_IDS } from '@/lib/coachOptions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SEP = ' · ';

// Current coach profile (this season's my_coach row) for the signed-in member, plus the pick-lists.
export async function GET() {
  const user = await getUser();
  if (!user) return unauthorized();
  const c = await getDynastyCtx(user.id);
  if (!c) return fail(409, 'Join a dynasty first.');
  const { data } = await getSupabase().from('my_coach').select('*').eq('dynasty_id', c.dynastyId).eq('user_id', user.id).eq('season', c.season).maybeSingle();
  return NextResponse.json({
    coach: data
      ? {
          name: data.name, image: data.image_url || null, position: POSITION_IDS.indexOf(data.title) > -1 ? data.title : null, almaMater: data.alma_mater, pipeline: data.recruiting_pipeline,
          offense: data.offense, defense: data.defense,
          philosophy: data.coaching_philosophy ? String(data.coaching_philosophy).split(SEP) : [],
        }
      : null,
    options: { positions: POSITIONS, offenseGroups: OFFENSE_GROUPS, defense: DEFENSE_PLAYBOOKS, pipelines: PIPELINES, philosophies: PHILOSOPHIES, philosophyPicks: PHILOSOPHY_PICKS },
  });
}

// Create/update this season's coach profile. Every choice is validated against its list.
export async function POST(req: NextRequest) {
  const user = await getUser();
  if (!user) return unauthorized();
  const c = await getDynastyCtx(user.id);
  if (!c || !c.team) return fail(409, 'Pick a team first.');

  const b = await req.json().catch(() => ({}));
  const name = String(b.name || '').trim();
  if (name.length < 2 || name.length > 40) return fail(400, 'Enter your coach name (2-40 characters).');

  const sb = getSupabase();
  const { data: schools } = await sb.from('assets').select('team_name');
  const schoolSet = new Set((schools || []).map((s: any) => s.team_name));

  if (!schoolSet.has(b.almaMater)) return fail(400, 'Choose your alma mater.');
  if (POSITION_IDS.indexOf(b.position) === -1) return fail(400, 'Choose your coaching position.');
  if (PIPELINES.indexOf(b.pipeline) === -1) return fail(400, 'Choose your recruiting pipeline.');
  // Head coaches choose both playbooks; a coordinator must choose their own side (the other is optional).
  const needOffense = b.position === 'HC' || b.position === 'OC';
  const needDefense = b.position === 'HC' || b.position === 'DC';
  const offenseOk = OFFENSE_PLAYBOOKS.indexOf(b.offense) > -1;
  const defenseOk = DEFENSE_PLAYBOOKS.indexOf(b.defense) > -1;
  if (needOffense && !offenseOk) return fail(400, 'Choose your offensive playbook.');
  if (needDefense && !defenseOk) return fail(400, 'Choose your defensive playbook.');
  const picks: string[] = Array.isArray(b.philosophy) ? b.philosophy.map(String) : [];
  const uniquePicks = Array.from(new Set(picks));
  if (uniquePicks.length !== PHILOSOPHY_PICKS || uniquePicks.some((p) => PHILOSOPHIES.indexOf(p) === -1)) {
    return fail(400, `Pick exactly ${PHILOSOPHY_PICKS} coaching philosophies.`);
  }

  // Image is optional: either nothing (initials are shown) or this member's own uploaded file.
  let image: string | null = null;
  if (b.image) {
    const base = `${process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/coach_images/${c.dynastyId}/${user.id}.jpg`;
    if (typeof b.image !== 'string' || b.image.split('?')[0] !== base) return fail(400, 'That image is not valid. Upload it again.');
    image = b.image;
  }

  const row = {
    name,
    image_url: image,
    alma_mater: b.almaMater,
    recruiting_pipeline: b.pipeline,
    offense: offenseOk ? b.offense : null,
    defense: defenseOk ? b.defense : null,
    coaching_philosophy: uniquePicks.join(SEP),
    team: c.team,
    title: b.position,
  };

  const { data: existing } = await sb.from('my_coach').select('id').eq('dynasty_id', c.dynastyId).eq('user_id', user.id).eq('season', c.season).maybeSingle();
  const { error } = existing
    ? await sb.from('my_coach').update(row).eq('id', existing.id)
    : await sb.from('my_coach').insert({ ...row, dynasty_id: c.dynastyId, user_id: user.id, season: c.season });
  if (error) return fail(500, error.message);
  return NextResponse.json({ ok: true });
}
