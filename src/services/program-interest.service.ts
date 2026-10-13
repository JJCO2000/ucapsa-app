import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import type { Database } from '../types/database.types';
import { sortProgramInterestsByAttention } from '../utils/program-interest.utils';

/** Temporal schema extension for a migration not yet deployed to production.
 * After applying the migration, regenerate database.generated.ts and remove this adapter.
 */
type ProgramInterestStatus = 'pending' | 'contacted' | 'closed';
export type ProgramInterestCode = 'puppy' | 'comandos';
type InterestRow = {
  id: string;
  user_id: string;
  dog_id: string;
  program_code: ProgramInterestCode;
  status: ProgramInterestStatus;
  priority: 'urgent';
  created_at: string;
  updated_at: string;
};
type InterestTable = {
  Row: InterestRow;
  Insert: { user_id: string; dog_id: string; program_code: ProgramInterestCode };
  Update: { status?: ProgramInterestStatus };
  Relationships: [];
};
type InterestDb = Omit<Database, 'public'> & {
  public: Omit<Database['public'], 'Tables'> & {
    Tables: Database['public']['Tables'] & { program_interest_requests: InterestTable };
  };
};
const requestDb = supabase as unknown as SupabaseClient<InterestDb>;

export type ProgramInterestRequest = InterestRow;
export type AdminProgramInterestRequest = InterestRow & {
  customerName: string;
  dogName: string;
  customerPhone: string | null;
};

export async function getMyProgramInterestRequests(userId: string): Promise<ProgramInterestRequest[]> {
  const { data, error } = await requestDb.from('program_interest_requests')
    .select('*').eq('user_id', userId).order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function requestProgramInterest(userId: string, dogId: string, code: ProgramInterestCode): Promise<ProgramInterestRequest> {
  if (!userId || !dogId || (code !== 'puppy' && code !== 'comandos')) {
    throw new Error('Elige un perro y un curso válido.');
  }
  // La restricción única DB impide solicitudes concurrentes abiertas duplicadas.
  const { data, error } = await requestDb.from('program_interest_requests')
    .insert({ user_id: userId, dog_id: dogId, program_code: code })
    .select('*').single();
  if (!error && data) return data;
  if (error?.code === '23505') {
    const existing = (await getMyProgramInterestRequests(userId)).find((row) =>
      row.dog_id === dogId && row.program_code === code && row.status !== 'closed',
    );
    if (existing) return existing;
  }
  throw error ?? new Error('No se pudo registrar la solicitud.');
}

export async function getAdminProgramInterestRequests(): Promise<AdminProgramInterestRequest[]> {
  const { data, error } = await requestDb.from('program_interest_requests')
    .select('*').in('status', ['pending', 'contacted'])
    .order('created_at', { ascending: true });
  if (error) throw error;
  if (!data?.length) return [];
  const ownerIds = [...new Set(data.map((row) => row.user_id))];
  const dogIds = [...new Set(data.map((row) => row.dog_id))];
  const [owners, dogs] = await Promise.all([
    supabase.from('profiles').select('user_id,full_name,phone').in('user_id', ownerIds),
    supabase.from('dogs').select('id,name').in('id', dogIds),
  ]);
  if (owners.error) throw owners.error;
  if (dogs.error) throw dogs.error;
  const byOwner = new Map((owners.data ?? []).map((item) => [item.user_id, item]));
  const byDog = new Map((dogs.data ?? []).map((item) => [item.id, item]));
  return sortProgramInterestsByAttention(data.map((row) => ({
    ...row,
    customerName: byOwner.get(row.user_id)?.full_name || 'Cliente UCAPSA',
    customerPhone: byOwner.get(row.user_id)?.phone ?? null,
    dogName: byDog.get(row.dog_id)?.name || 'Perro',
  })));
}

export async function updateAdminProgramInterestRequest(id: string, status: 'contacted' | 'closed') {
  const { error } = await requestDb.from('program_interest_requests')
    .update({ status })
    .eq('id', id);
  if (error) throw error;
}
