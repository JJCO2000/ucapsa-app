import { supabase } from '../lib/supabase';
import type { Membership } from '../types/app.types';
import { getMembershipEligibilityForUser } from './memberships-eligibility.service';
import { isMembershipActiveToday } from './memberships.domain';

export async function getMyMembership(): Promise<Membership | null> {
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;

  const userId = authData.user?.id;
  if (!userId) return null;

  const { data, error } = await supabase
    .from('memberships')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return (data as Membership | null) ?? null;
}

export async function requestMembership(): Promise<Membership> {
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;

  const userId = authData.user?.id;
  if (!userId) throw new Error('No hay sesion activa.');

  const existing = await getMyMembership();
  if (existing?.status === 'pending') return existing;
  if (existing?.status === 'active') {
    if (isMembershipActiveToday(existing)) return existing;
    throw new Error(
      'La membresia esta marcada activa pero aun no esta vigente. Administracion debe revisar su fecha de inicio antes de crear una nueva solicitud.',
    );
  }

  const eligibility = await getMembershipEligibilityForUser(userId);
  if (!eligibility.eligible) {
    throw new Error(
      'Para solicitar membresia primero debes estar inscrito o haber completado Puppy o Comandos.',
    );
  }

  const { data, error } = await supabase
    .from('memberships')
    .insert({
      user_id: userId,
      status: 'pending',
    })
    .select('*')
    .single();

  if (error) throw error;
  return data as Membership;
}
