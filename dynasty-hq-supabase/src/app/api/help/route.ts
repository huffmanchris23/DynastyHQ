import { NextResponse } from 'next/server';
import { getUser, unauthorized } from '@/lib/auth';
import { getSupabase } from '@/lib/supabaseClient';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Published tips and FAQs (global to the app, edited in the database).
export async function GET() {
  if (!(await getUser())) return unauthorized();
  const { data } = await getSupabase().from('help_articles').select('id, kind, title, body, sort_order').eq('published', true).order('sort_order').order('created_at');
  return NextResponse.json({ articles: data || [], contactEmail: process.env.NEXT_PUBLIC_CONTACT_EMAIL || null });
}
