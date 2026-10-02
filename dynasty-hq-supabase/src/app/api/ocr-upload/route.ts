import { NextResponse } from 'next/server';
import { getUser, unauthorized } from '@/lib/auth';
import { getSupabase } from '@/lib/supabaseClient';
import { getDynastyCtx } from '@/lib/dynastyContext';
import { buildFileName, sniffImageMediaType, openWeekOf, toOcrCtx, MEMBER_SLOTS, SCREEN_TYPES, type ScreenType } from '@/lib/ocrShared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

// What can this caller upload, and what have they already uploaded for the open week?
export async function GET() {
  const user = await getUser();
  if (!user) return unauthorized();
  const c = await getDynastyCtx(user.id);
  if (!c || !c.team) return NextResponse.json({ error: 'Join a dynasty and pick a team first.' }, { status: 409 });

  const week = openWeekOf(c);
  const slots = c.isCommish ? [...SCREEN_TYPES] : MEMBER_SLOTS;
  if (week === null) return NextResponse.json({ open: false, week: null, slots, uploadedSlots: [], isCommish: c.isCommish });

  const o = toOcrCtx(c, week);
  const sb = getSupabase();
  const files: { name: string }[] = [];
  const pageSize = 100;
  for (let offset = 0; ; offset += pageSize) {
    const { data: page, error } = await sb.storage.from(o.bucket).list(o.folder, { limit: pageSize, offset });
    if (error) return NextResponse.json({ error: `Couldn't list uploads: ${error.message}` }, { status: 500 });
    if (!page || page.length === 0) break;
    files.push(...page);
    if (page.length < pageSize) break;
  }
  const prefix = `w${week}_`;
  const uploadedSlots = files.filter((f) => f.name.startsWith(prefix) && f.name.endsWith('.png')).map((f) => f.name.slice(prefix.length, -'.png'.length));

  // Which of this caller's slots have already processed successfully this week?
  const { data: logRows } = await sb
    .from('ocr_audit_log').select('screen_type, status')
    .eq('dynasty_id', c.dynastyId).eq('season', c.season).eq('week', week).eq('uploaded_by', c.userId);
  const processed = Array.from(new Set((logRows || []).filter((r: any) => r.status === 'success').map((r: any) => r.screen_type)));

  return NextResponse.json({ open: true, week, slots, uploadedSlots, processed, isCommish: c.isCommish });
}

// Body: { slot, imageBase64 }
export async function POST(req: Request) {
  const user = await getUser();
  if (!user) return unauthorized();
  let body: { slot?: string; imageBase64?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const slot = body.slot as ScreenType;
  if (!slot || !SCREEN_TYPES.includes(slot)) return NextResponse.json({ error: `Unknown slot "${body.slot}".` }, { status: 400 });
  if (!body.imageBase64) return NextResponse.json({ error: 'No image data provided.' }, { status: 400 });

  const c = await getDynastyCtx(user.id);
  if (!c || !c.team) return NextResponse.json({ error: 'Join a dynasty and pick a team first.' }, { status: 409 });
  if (!c.isCommish && !MEMBER_SLOTS.includes(slot)) return NextResponse.json({ error: 'Only the commissioner uploads that screen.' }, { status: 403 });

  const week = openWeekOf(c);
  if (week === null) return NextResponse.json({ error: 'No week is open for uploads. Your commissioner opens the next week first.' }, { status: 409 });

  const raw = body.imageBase64.includes(',') ? body.imageBase64.split(',')[1] : body.imageBase64;
  const buffer = Buffer.from(raw, 'base64');
  if (buffer.length > 8 * 1024 * 1024) return NextResponse.json({ error: 'That image is too large (8 MB max).' }, { status: 413 });

  const o = toOcrCtx(c, week);
  const path = `${o.folder}/${buildFileName(slot, week)}`;
  const { error } = await getSupabase().storage.from(o.bucket).upload(path, buffer, {
    contentType: sniffImageMediaType(buffer),
    upsert: true, // re-uploading a slot overwrites it
  });
  if (error) return NextResponse.json({ error: `Upload failed: ${error.message}` }, { status: 500 });

  return NextResponse.json({ ok: true, week, slot });
}
