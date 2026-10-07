/**
 * App-owner check. The owner is whoever has a row in `app_owners`
 * (managed directly in Supabase). Used to gate the Reports inbox.
 */
import { getSupabase } from './supabaseClient';

export async function isAppOwner(userId: string): Promise<boolean> {
  const { data } = await getSupabase().from('app_owners').select('user_id').eq('user_id', userId).maybeSingle();
  return !!data;
}
