import { ucapsaBrand } from '../constants/brand';
import { supabase } from '../lib/supabase';
import type { TableUpdate } from '../types/database.helpers';
import type { Profile } from '../types/app.types';


type SupabaseErrorDetails = {
  code?: unknown;
  message?: unknown;
  details?: unknown;
  hint?: unknown;
};

function logProfileMutationError(operation: string, error: unknown) {
  const details = (error ?? {}) as SupabaseErrorDetails;
  if (!__DEV__) return;
  console.log(`[UCAPSA][profiles] ${operation} failed`, {
    code: details.code ?? null,
    message: details.message ?? (error instanceof Error ? error.message : String(error)),
    details: details.details ?? null,
    hint: details.hint ?? null,
  });
}

export type ProfileUpdateInput = {
  full_name?: string | null;
  phone?: string | null;
  dog_name?: string | null;
  avatar_color?: string | null;
};


export type EmailChangeResult = {
  requestedEmail: string;
  currentEmail: string | null;
  confirmationRequired: boolean;
};

export async function requestMyEmailChange(nextEmail: string): Promise<EmailChangeResult> {
  const normalizedEmail = nextEmail.trim().toLowerCase();
  if (!normalizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    throw new Error('Escribe un correo válido.');
  }

  const { data, error } = await supabase.auth.updateUser({ email: normalizedEmail });
  if (error) {
    logProfileMutationError('requestMyEmailChange', error);
    throw error;
  }

  const currentEmail = data.user?.email ?? null;
  return {
    requestedEmail: normalizedEmail,
    currentEmail,
    confirmationRequired: currentEmail?.toLowerCase() !== normalizedEmail,
  };
}

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
  if (authError) {
    logProfileMutationError('updateMyProfile/auth', authError);
    throw authError;
  }

  const userId = authData.user?.id;
  if (!userId) throw new Error('No hay sesion activa.');

  const payload: Record<string, string | null> = { updated_at: new Date().toISOString() };

  if (input.full_name !== undefined) payload.full_name = input.full_name?.trim() || null;
  if (input.phone !== undefined) payload.phone = input.phone?.trim() || null;
  if (input.dog_name !== undefined) payload.dog_name = input.dog_name?.trim() || null;
  if (input.avatar_color !== undefined) payload.avatar_color = input.avatar_color || ucapsaBrand.colors.red;

  const { data, error } = await supabase
    .from('profiles')
    .update(payload as TableUpdate<'profiles'>)
    .eq('user_id', userId)
    .select('*')
    .single();

  if (error) {
    logProfileMutationError('updateMyProfile/update', error);
    throw error;
  }
  return data as Profile;
}


export async function updateAdminCustomerProfile(userId: string, input: ProfileUpdateInput): Promise<Profile> {
  const payload: Record<string, string | null> = { updated_at: new Date().toISOString() };

  if (input.full_name !== undefined) payload.full_name = input.full_name?.trim() || null;
  if (input.phone !== undefined) payload.phone = input.phone?.trim() || null;
  if (input.dog_name !== undefined) payload.dog_name = input.dog_name?.trim() || null;
  if (input.avatar_color !== undefined) payload.avatar_color = input.avatar_color || ucapsaBrand.colors.red;

  const { data, error } = await supabase
    .from('profiles')
    .update(payload as TableUpdate<'profiles'>)
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
  if (!userId) throw new Error('No hay sesion activa.');

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

export async function updateProfileDogName(userId: string, dogName: string): Promise<Profile> {
  const { data, error } = await supabase
    .from('profiles')
    .update({
      dog_name: dogName.trim() || null,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
    .select('*')
    .single();

  if (error) throw error;
  return data as Profile;
}
