import { NextRequest, NextResponse } from 'next/server';
import { getUser, unauthorized } from '@/lib/auth';
import { getSupabase } from '@/lib/supabaseClient';
import { pushEnabled } from '@/lib/push';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Is push set up on the server, and what is the public key the browser needs?
export async function GET() {
  const user = await getUser();
  if (!user) return unauthorized();
  return NextResponse.json({ enabled: pushEnabled(), publicKey: pushEnabled() ? process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY : null });
}

// Save this device: { subscription } from PushManager.subscribe()
export async function POST(req: NextRequest) {
  const user = await getUser();
  if (!user) return unauthorized();
  const b = await req.json().catch(() => ({}));
  const sub = b.subscription;
  if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) return NextResponse.json({ error: 'Bad subscription.' }, { status: 400 });
  const { error } = await getSupabase().from('push_subscriptions').upsert(
    { user_id: user.id, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth, user_agent: (req.headers.get('user-agent') || '').slice(0, 200) },
    { onConflict: 'endpoint' }
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// Forget this device: { endpoint }
export async function DELETE(req: NextRequest) {
  const user = await getUser();
  if (!user) return unauthorized();
  const b = await req.json().catch(() => ({}));
  if (b.endpoint) await getSupabase().from('push_subscriptions').delete().eq('user_id', user.id).eq('endpoint', b.endpoint);
  return NextResponse.json({ ok: true });
}
