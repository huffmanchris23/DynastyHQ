import { NextRequest, NextResponse } from 'next/server';
import { fail, getMember, getUser, setActiveCookie, unauthorized } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Switch which dynasty the app is showing.
export async function POST(req: NextRequest) {
  const user = await getUser();
  if (!user) return unauthorized();
  const { dynastyId } = await req.json().catch(() => ({}));
  if (!dynastyId || !(await getMember(String(dynastyId), user.id))) return fail(403, 'You are not a member of that dynasty.');
  return setActiveCookie(NextResponse.json({ ok: true }), String(dynastyId));
}
