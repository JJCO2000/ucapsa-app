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

export type DogClaimPreview = {
  status: 'available' | 'none' | 'unverified' | 'not_applicable' | 'conflict';
  count: number;
};

/**
 * Look up ONLY preregistrations matching the current user's already
 * confirmed Auth contact. Never pass arbitrary email/phone to this RPC.
 * The server returns a count, not dog names or third-party contact data.
 */
export async function previewMyPreregisteredDogs(): Promise<DogClaimPreview> {
  if (!preregistrationEnabled) throw new Error('La preinscripción no está habilitada.');
  const rpc = supabase.rpc.bind(supabase) as unknown as (
    name: 'preview_my_preregistered_dogs',
  ) => PromiseLike<RpcOutcome>;
  const { data, error } = await rpc('preview_my_preregistered_dogs');
  if (error) throw new Error(error.message);
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('No se pudo consultar la preinscripción.');
  }
  const row = data as Record<string, unknown>;
  if (!['available','none','unverified','not_applicable','conflict'].includes(String(row.status))
    || !Number.isSafeInteger(row.count) || Number(row.count) < 0) {
    throw new Error('La respuesta del servidor no es válida.');
  }
  return { status: row.status as DogClaimPreview['status'], count: Number(row.count) };
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


export type ManualLinkPreview = {
  status: 'available' | 'none' | 'conflict' | 'account_not_found';
  personId?: string;
  userId?: string;
  ownerName?: string;
  accountName?: string;
  accountEmail?: string;
  dogCount?: number;
};

/** Admin must verify the real-world identity before authorizing the account.
 * The entered email is solely an account locator, never ownership evidence.
 */
export async function adminPreviewPreregistrationOwnerLink(
  ownerContact: string, accountEmail: string,
): Promise<ManualLinkPreview> {
  if (!preregistrationEnabled) throw new Error('La preinscripción está deshabilitada.');
  const rpc = supabase.rpc.bind(supabase) as unknown as
    (name: string, args: Record<string, unknown>) => PromiseLike<RpcOutcome>;
  const { data, error } = await rpc('admin_preview_preregistration_owner_link', {
    p_owner_contact: ownerContact.trim(),
    p_account_email: accountEmail.trim().toLowerCase(),
  });
  if (error) throw new Error(error.message);
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('Supabase devolvió una respuesta de revisión inválida.');
  }
  const raw = data as Record<string, unknown>;
  if (!['available','none','conflict','account_not_found'].includes(String(raw.status))) {
    throw new Error('Estado inesperado en la revisión administrativa.');
  }
  if (raw.status !== 'available') return { status: raw.status as ManualLinkPreview['status'] };
  for (const key of ['person_id','user_id','owner_name','account_email']) {
    if (typeof raw[key] !== 'string' || !raw[key]) throw new Error('Datos incompletos en la revisión.');
  }
  if (!Number.isSafeInteger(raw.dog_count) || Number(raw.dog_count) < 1) {
    throw new Error('Cantidad de perros inválida.');
  }
  return {
    status: 'available',
    personId: String(raw.person_id), userId: String(raw.user_id),
    ownerName: String(raw.owner_name), accountName: String(raw.account_name ?? ''),
    accountEmail: String(raw.account_email), dogCount: Number(raw.dog_count),
  };
}

export async function adminApprovePreregistrationOwnerLink(
  personId: string, userId: string, reason: string,
): Promise<void> {
  const rpc = supabase.rpc.bind(supabase) as unknown as
    (name: string, args: Record<string, unknown>) => PromiseLike<RpcOutcome>;
  const { data, error } = await rpc('admin_approve_preregistration_owner_link', {
    p_person_id: personId, p_user_id: userId, p_reason: reason.trim(),
  });
  if (error) throw new Error(error.message);
  if (!data || typeof data !== 'object' || (data as Record<string,unknown>).status !== 'approved') {
    throw new Error('No se confirmó la autorización.');
  }
}
