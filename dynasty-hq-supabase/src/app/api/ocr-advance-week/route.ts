import { NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabaseClient';
import { getCurrentContext, USER_ID, DYNASTY_ID } from '@/lib/ocrShared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function POST() {
  const sb = getSupabase();

  let ctx;
  try {
    ctx = await getCurrentContext();
  } catch (err: any) {
    return NextResponse.json({ error: `Couldn't resolve current week: ${err?.message || err}` }, { status: 500 });
  }

  const nextWeek = ctx.week + 1;

  const { data: nextRow, error: findErr } = await sb
    .from('game_preview')
    .select('id, week')
    .eq('user_id', USER_ID)
    .eq('dynasty_id', Number(DYNASTY_ID))
    .eq('week', String(nextWeek))
    .limit(1);
  if (findErr) return NextResponse.json({ error: `game_preview: ${findErr.message}` }, { status: 500 });
  if (!nextRow || !nextRow[0]) {
    return NextResponse.json({ error: `No game_preview row exists yet for week ${nextWeek}.` }, { status: 400 });
  }

  const { error: offErr } = await sb
    .from('game_preview')
    .update({ current_week: false })
    .eq('user_id', USER_ID)
    .eq('dynasty_id', Number(DYNASTY_ID))
    .eq('week', String(ctx.week));
  if (offErr) return NextResponse.json({ error: `Couldn't clear week ${ctx.week}: ${offErr.message}` }, { status: 500 });

  const { error: onErr } = await sb.from('game_preview').update({ current_week: true }).eq('id', nextRow[0].id);
  if (onErr) return NextResponse.json({ error: `Couldn't set week ${nextWeek}: ${onErr.message}` }, { status: 500 });

  return NextResponse.json({ previousWeek: ctx.week, week: nextWeek });
}
