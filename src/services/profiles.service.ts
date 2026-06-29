import { supabase } from '../lib/supabase';
import type { Profile } from '../types/app.types';

export async function getProfileByUserId(userId: string) {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  return {
    data: (data as Profile | null) ?? null,
    error,
  };
}

export async function updateMyProfile(
  userId: string,
  updates: Pick<Profile, 'full_name' | 'phone'>
) {
  const { data, error } = await supabase
    .from('profiles')
    .update(updates)
    .eq('user_id', userId)
    .select('*')
    .maybeSingle();

  return {
    data: (data as Profile | null) ?? null,
    error,
  };
}
