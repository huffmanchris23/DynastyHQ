import { NextResponse } from 'next/server';
import { getDashboardData } from '@/lib/dashboard';

// Always queries Supabase fresh on every request — same "no caching" behavior
// as the original, which re-read the spreadsheet on every doGet().
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  try {
    const data = await getDashboardData();
    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json({ message: err?.message || String(err) }, { status: 500 });
  }
}
