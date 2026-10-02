/**
 * Cookie-bound Supabase client for the SIGNED-IN USER (anon/publishable key).
 * Used only to find out who is calling. Data access in API routes still goes
 * through getSupabase() (service role) AFTER the route has checked the user's
 * role/membership in code.
 */
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export function createAuthClient() {
  const store = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return store.getAll();
        },
        setAll(list: { name: string; value: string; options: any }[]) {
          try {
            list.forEach(({ name, value, options }) => store.set(name, value, options));
          } catch {
            /* called from a Server Component — middleware refreshes the session instead */
          }
        },
      },
    }
  );
}
