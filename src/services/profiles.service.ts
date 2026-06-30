import { supabase } from '../lib/supabase';
import type { Profile } from '../types/app.types';

export type ProfileUpdateInput = {
  full_name?: string | null;
  email?: string | null;
  phone?: string | null;
  dog_name?: string | null;
  avatar_color?: string | null;
};

export async function getProfileByUserId(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;
  return (data as Profile | null) ?? null;
}

export async function updateMyProfile(input: ProfileUpdateInput): Promise<Profile> {
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;

  const userId = authData.user?.id;
  if (!userId) throw new Error('No hay sesión activa.');

  const payload: Record<string, string | null> = { updated_at: new Date().toISOString() };

  if ('full_name' in input) payload.full_name = input.full_name?.trim() || null;
  if ('email' in input) payload.email = input.email?.trim() || null;
  if ('phone' in input) payload.phone = input.phone?.trim() || null;
  if ('dog_name' in input) payload.dog_name = input.dog_name?.trim() || null;
  if ('avatar_color' in input) payload.avatar_color = input.avatar_color || '#0f766e';

  const { data, error } = await supabase
    .from('profiles')
    .update(payload)
    .eq('user_id', userId)
    .select('*')
    .single();

  if (error) throw error;
  return data as Profile;
}

export async function requestAccountDeletion(reason?: string): Promise<void> {
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;

  const userId = authData.user?.id;
  if (!userId) throw new Error('No hay sesión activa.');

  const { error } = await supabase
    .from('profiles')
    .update({
      deletion_requested_at: new Date().toISOString(),
      deletion_request_reason: reason?.trim() || 'Solicitud desde la app.',
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId);

  if (error) throw error;
}
