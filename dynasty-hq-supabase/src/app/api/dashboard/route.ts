import { NextResponse } from 'next/server';
import { getUser, unauthorized } from '@/lib/auth';
import { getDynastyCtx } from '@/lib/dynastyContext';
import { getDashboardData } from '@/lib/dashboard';

// Always queries Supabase fresh on every request — same "no caching" behavior
// as the original, which re-read the spreadsheet on every doGet().
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  const user = await getUser();
  if (!user) return unauthorized();
  try {
    const ctx = await getDynastyCtx(user.id);
    if (!ctx) return NextResponse.json({ message: 'You are not in a dynasty yet.' }, { status: 404 });
    if (!ctx.team) return NextResponse.json({ message: 'Pick a team first.' }, { status: 409 });
    const data = await getDashboardData(ctx);
    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json({ message: err?.message || String(err) }, { status: 500 });
  }
}
