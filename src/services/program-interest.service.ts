import { supabase } from '../lib/supabase';
import type { TableRow } from '../types/database.helpers';
import { sortProgramInterestsByAttention } from '../utils/program-interest.utils';

/** Campos restringidos por CHECK en Supabase; resto derivado del esquema generado. */
type ProgramInterestStatus = 'pending' | 'contacted' | 'closed';
export type ProgramInterestCode = 'puppy' | 'comandos';
type InterestRow = TableRow<'program_interest_requests'> & {
  program_code: ProgramInterestCode;
  status: ProgramInterestStatus;
  priority: 'urgent';
};

export type ProgramInterestRequest = InterestRow;
export type AdminProgramInterestRequest = InterestRow & {
  customerName: string;
  dogName: string;
  customerPhone: string | null;
};

export async function getMyProgramInterestRequests(userId: string): Promise<ProgramInterestRequest[]> {
  const { data, error } = await supabase.from('program_interest_requests')
    .select('*').eq('user_id', userId).order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as InterestRow[];
}

export async function requestProgramInterest(userId: string, dogId: string, code: ProgramInterestCode): Promise<ProgramInterestRequest> {
  if (!userId || !dogId || (code !== 'puppy' && code !== 'comandos')) {
    throw new Error('Elige un perro y un curso válido.');
  }
  // La restricción única DB impide solicitudes concurrentes abiertas duplicadas.
  const { data, error } = await supabase.from('program_interest_requests')
    .insert({ user_id: userId, dog_id: dogId, program_code: code })
    .select('*').single();
  if (!error && data) return data as InterestRow;
  if (error?.code === '23505') {
    const existing = (await getMyProgramInterestRequests(userId)).find((row) =>
      row.dog_id === dogId && row.program_code === code && row.status !== 'closed',
    );
    if (existing) return existing;
  }
  throw error ?? new Error('No se pudo registrar la solicitud.');
}

export async function getAdminProgramInterestRequests(): Promise<AdminProgramInterestRequest[]> {
  const { data, error } = await supabase.from('program_interest_requests')
    .select('*').in('status', ['pending', 'contacted'])
    .order('created_at', { ascending: true });
  if (error) throw error;
  const records = (data ?? []) as InterestRow[];
  if (!records.length) return [];
  const ownerIds = [...new Set(records.map((row) => row.user_id))];
  const dogIds = [...new Set(records.map((row) => row.dog_id))];
  const [owners, dogs] = await Promise.all([
    supabase.from('profiles').select('user_id,full_name,phone').in('user_id', ownerIds),
    supabase.from('dogs').select('id,name').in('id', dogIds),
  ]);
  if (owners.error) throw owners.error;
  if (dogs.error) throw dogs.error;
  const byOwner = new Map((owners.data ?? []).map((item) => [item.user_id, item]));
  const byDog = new Map((dogs.data ?? []).map((item) => [item.id, item]));
  return sortProgramInterestsByAttention(records.map((row) => ({
    ...row,
    customerName: byOwner.get(row.user_id)?.full_name || 'Cliente UCAPSA',
    customerPhone: byOwner.get(row.user_id)?.phone ?? null,
    dogName: byDog.get(row.dog_id)?.name || 'Perro',
  })));
}

export async function updateAdminProgramInterestRequest(id: string, status: 'contacted' | 'closed') {
  const { data, error } = await supabase.from('program_interest_requests')
    .update({ status })
    .eq('id', id)
    .select('id,status,updated_at')
    .single();
  if (error) throw error;
  if (!data || data.status !== status) {
    throw new Error('No pudimos confirmar el cambio de estado de la solicitud.');
  }
}
