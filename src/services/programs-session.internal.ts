import { supabase } from '../lib/supabase';

export async function getProgramServiceCurrentUserId() {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  return data.user?.id ?? null;
}
