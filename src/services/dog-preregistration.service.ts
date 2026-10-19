import { supabase } from '../lib/supabase';
import type { Database } from '../types/database.types';
import { preregistrationEnabled } from '../constants/preregistrationFeature';

export type PreregisteredProgramInput = {
  ownerName: string;
  ownerEmail: string;
  ownerPhone: string;
  dogName: string;
  programCode: 'puppy' | 'comandos';
  programLevel: 'base' | 'principiante' | 'medio' | 'avanzado';
  physicalCardNumber: string;
  cardStartedOn: string | null;
  totalAttendances: number;
  knownAttendanceDates: string[];
  sourceNote: string;
};

export type PreregistrationRpcName = Extract<keyof Database['public']['Functions'],
  | 'admin_preregister_dog_with_program'
  | 'claim_my_preregistered_dogs'
  | 'get_staff_preregistered_class_roster'
  | 'staff_register_preregistered_attendance'>;
type RpcOutcome = {
  data: unknown;
  error: { message: string } | null;
};

// Los nombres RPC están restringidos a las funciones existentes en los tipos
// regenerados oficialmente desde Supabase. La frontera de parámetros tolera
// fechas SQL nulas que el generador declara como cadenas no nulas.
export async function callPreregistrationRpc(
  name: PreregistrationRpcName,
  args: Record<string, unknown> = {},
): Promise<RpcOutcome> {
  if (!preregistrationEnabled) throw new Error('La preinscripción todavía no está habilitada.');
  const rpc = supabase.rpc.bind(supabase) as unknown as (
    functionName: string,
    params: Record<string, unknown>,
  ) => PromiseLike<RpcOutcome>;
  const response = await rpc(name, args);
  if (response.error) throw new Error(response.error.message);
  return response;
}

export async function adminPreregisterDogWithProgram(input: PreregisteredProgramInput): Promise<string> {
  const { data } = await callPreregistrationRpc('admin_preregister_dog_with_program', {
    p_owner_name: input.ownerName.trim(),
    p_owner_email: input.ownerEmail.trim().toLowerCase(),
    p_owner_phone: input.ownerPhone.trim(),
    p_dog_name: input.dogName.trim(),
    p_program_code: input.programCode,
    p_program_level: input.programLevel,
    p_card_number: input.programCode === 'puppy' ? input.physicalCardNumber.trim() : '',
    p_card_started_on: input.programCode === 'puppy' ? input.cardStartedOn : null,
    p_total_attendances: input.totalAttendances,
    p_known_dates: input.knownAttendanceDates,
    p_note: input.sourceNote.trim() || null,
  });
  if (typeof data !== 'string' || !data) {
    throw new Error('Supabase no confirmó la preinscripción.');
  }
  return data;
}

export type DogClaimResult = {
  status: 'linked' | 'none' | 'unverified' | 'not_applicable' | 'conflict';
  linkedDogs: number;
};

export async function claimMyPreregisteredDogs(): Promise<DogClaimResult> {
  const { data } = await callPreregistrationRpc('claim_my_preregistered_dogs');
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('Respuesta inválida al vincular el expediente.');
  }
  const row = data as Record<string, unknown>;
  const status = row.status;
  if (status !== 'linked' && status !== 'none' && status !== 'unverified'
      && status !== 'not_applicable' && status !== 'conflict') {
    throw new Error('Supabase respondió un estado de vinculación inesperado.');
  }
  return {
    status,
    linkedDogs: typeof row.linked_dogs === 'number' && Number.isSafeInteger(row.linked_dogs)
      ? row.linked_dogs : 0,
  };
}
