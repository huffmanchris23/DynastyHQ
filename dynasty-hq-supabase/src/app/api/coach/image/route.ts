import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabaseClient';
import { fail, getUser, unauthorized } from '@/lib/auth';
import { getDynastyCtx } from '@/lib/dynastyContext';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BYTES = 600 * 1024; // the browser shrinks to 512x512 JPEG first; this is a hard ceiling

// Body: { imageBase64 } — a JPEG already resized by the browser.
export async function POST(req: NextRequest) {
  const user = await getUser();
  if (!user) return unauthorized();
  const c = await getDynastyCtx(user.id);
  if (!c) return fail(409, 'Join a dynasty first.');

  const b = await req.json().catch(() => ({}));
  const raw = typeof b.imageBase64 === 'string' ? b.imageBase64 : '';
  const buf = Buffer.from(raw.includes(',') ? raw.split(',')[1] : raw, 'base64');
  if (!buf.length) return fail(400, 'No image received.');
  if (buf.length > MAX_BYTES) return fail(413, 'That image is too large.');
  // JPEG magic bytes — the client always re-encodes to JPEG, so anything else is rejected.
  if (!(buf[0] === 0xff && buf[1] === 0xd8)) return fail(400, 'Only JPEG images are accepted.');

  const path = `${c.dynastyId}/${user.id}.jpg`;
  const sb = getSupabase();
  const { error } = await sb.storage.from('coach_images').upload(path, buf, { contentType: 'image/jpeg', upsert: true });
  if (error) return fail(500, `Upload failed: ${error.message}`);

  const { data } = sb.storage.from('coach_images').getPublicUrl(path);
  return NextResponse.json({ url: `${data.publicUrl}?v=${Date.now()}` });
}
