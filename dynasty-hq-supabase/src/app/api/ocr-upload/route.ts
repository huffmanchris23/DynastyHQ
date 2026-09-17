import { NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabaseClient';
import { getCurrentContext, buildFileName, sniffImageMediaType, SCREEN_TYPES, type ScreenType } from '@/lib/ocrShared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  let ctx;
  try {
    ctx = await getCurrentContext();
  } catch (err: any) {
    return NextResponse.json({ error: `Couldn't resolve current week: ${err?.message || err}` }, { status: 500 });
  }

  const sb = getSupabase();
  const { data: files, error } = await sb.storage.from(ctx.bucket).list('', { limit: 100 });
  if (error) return NextResponse.json({ error: `Couldn't list bucket: ${error.message}` }, { status: 500 });

  const prefix = `w${ctx.week}_`;
  const uploadedSlots = (files || [])
    .filter((f) => f.name.startsWith(prefix) && f.name.endsWith('.png'))
    .map((f) => f.name.slice(prefix.length, -'.png'.length));

  return NextResponse.json({ week: ctx.week, uploadedSlots });
}

// Body: { slot: ScreenType, imageBase64: string (data URL or raw base64) }
export async function POST(req: Request) {
  let body: { slot?: string; imageBase64?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const slot = body.slot as ScreenType;
  if (!slot || !SCREEN_TYPES.includes(slot)) {
    return NextResponse.json({ error: `Unknown slot "${body.slot}".` }, { status: 400 });
  }
  if (!body.imageBase64) {
    return NextResponse.json({ error: 'No image data provided.' }, { status: 400 });
  }

  // Strip a data URL prefix if present ("data:image/png;base64,...").
  const raw = body.imageBase64.includes(',') ? body.imageBase64.split(',')[1] : body.imageBase64;
  const buffer = Buffer.from(raw, 'base64');

  let ctx;
  try {
    ctx = await getCurrentContext();
  } catch (err: any) {
    return NextResponse.json({ error: `Couldn't resolve current week: ${err?.message || err}` }, { status: 500 });
  }

  const fileName = buildFileName(slot, ctx.week);
  const sb = getSupabase();

  const { error } = await sb.storage.from(ctx.bucket).upload(fileName, buffer, {
    contentType: sniffImageMediaType(buffer),
    upsert: true, // re-uploading the same slot overwrites, per house rule
  });

  if (error) {
    return NextResponse.json({ error: `Upload failed: ${error.message}` }, { status: 500 });
  }

  return NextResponse.json({ ok: true, bucket: ctx.bucket, path: fileName, week: ctx.week });
}
