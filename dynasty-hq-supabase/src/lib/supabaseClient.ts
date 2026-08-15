/**
 * ============================== SUPABASE CLIENT ==============================
 * Replaces sheets.ts. Server-only client using the SERVICE ROLE key, not the
 * anon/public key.
 *
 * Why service role: every table in this project has Row Level Security
 * enabled with no policies defined, so the anon key returns zero rows on
 * every query — this is not a bug, it's Supabase's default-secure behavior.
 * The service role key bypasses RLS entirely. It must NEVER be exposed to
 * the browser — this file is only ever imported from server-side code
 * (API routes), never from a 'use client' component.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

let cached: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (cached) return cached;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      'Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY env vars — see .env.example. ' +
        'Get these from Supabase Dashboard > Project Settings > API. Use the ' +
        '"service_role" secret key, not the "anon public" key.'
    );
  }
  cached = createClient(url, key, {
    auth: { persistSession: false },
    // Belt-and-suspenders against stale data: force every request this client
    // makes to skip Next.js's fetch cache, rather than relying solely on the
    // route's `dynamic = 'force-dynamic'` export. That setting governs
    // whether the route itself is statically rendered, but supabase-js's
    // internal fetch calls have been observed still returning a cached
    // response on Vercel — explicitly passing cache: 'no-store' on every
    // request closes that gap regardless of route-level config.
    global: {
      fetch: (input: RequestInfo | URL, init?: RequestInit) => fetch(input, { ...init, cache: 'no-store' }),
    },
  });
  return cached;
}
