import { supabase } from '../lib/supabase';
import { requireNoticeDeliveryMethod, type NoticeDeliveryMethod } from '../constants/privacy-notice-delivery';
import { assertIntakePublishedNotice } from './preregistration-privacy-coverage.service';
import { preregistrationDirectoryEnabled } from '../constants/preregistrationFeature';

export type AdminPreregistrationRecord = {
  intakeProgramId: string;
  intakeDogId: string;
  personId: string;
  ownerName: string;
  ownerEmail: string | null;
  ownerPhone: string | null;
  status: 'pending' | 'linked';
  linkedUserId: string | null;
  linkedEnrollmentId: string | null;
  dogName: string;
  programCode: 'puppy' | 'comandos';
  programLevel: 'base' | 'principiante' | 'medio' | 'avanzado';
  scheduleName: string;
  scheduleTime: string;
  physicalCardReference: string | null;
  authorizedOn: string;
  attendancesCount: number;
  datedAttendances: number;
  undatedAttendances: number;
  membershipStatus: string | null;
};

type ApiRow = Record<string, unknown>;

const toOptionalString = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value : null;

function toCount(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new Error('Respuesta administrativa inválida: ' + field);
  }
  return value;
}

function parseRow(value: unknown): AdminPreregistrationRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('El servidor devolvió una ficha de preinscripción inválida.');
  }
  const row = value as ApiRow;
  const required = [
    'intake_program_id', 'intake_dog_id', 'person_id', 'owner_name', 'dog_name',
    'program_level', 'schedule_name', 'schedule_time', 'authorized_on',
  ] as const;
  for (const key of required) {
    if (typeof row[key] !== 'string' || !(row[key] as string).trim()) {
      throw new Error('El servidor omitió un dato requerido: ' + key);
    }
  }
  if (row.program_code !== 'puppy' && row.program_code !== 'comandos') {
    throw new Error('Programa no reconocido en la ficha.');
  }
  if (!['base','principiante','medio','avanzado'].includes(String(row.program_level))) {
    throw new Error('Nivel de Comandos no reconocido.');
  }
  if (row.registration_status !== 'pending' && row.registration_status !== 'linked') {
    throw new Error('Estado de vinculación no reconocido.');
  }

  return {
    intakeProgramId: row.intake_program_id as string,
    intakeDogId: row.intake_dog_id as string,
    personId: row.person_id as string,
    ownerName: row.owner_name as string,
    ownerEmail: toOptionalString(row.owner_email),
    ownerPhone: toOptionalString(row.owner_phone),
    status: row.registration_status,
    linkedUserId: toOptionalString(row.linked_user_id),
    linkedEnrollmentId: toOptionalString(row.linked_enrollment_id),
    dogName: row.dog_name as string,
    programCode: row.program_code,
    programLevel: row.program_level as AdminPreregistrationRecord['programLevel'],
    scheduleName: row.schedule_name as string,
    scheduleTime: (row.schedule_time as string).slice(0, 5),
    physicalCardReference: row.program_code === 'puppy'
      ? toOptionalString(row.physical_card_reference) : null,
    authorizedOn: row.authorized_on as string,
    attendancesCount: toCount(row.attendances_count, 'total'),
    datedAttendances: toCount(row.dated_attendances, 'con fecha'),
    undatedAttendances: toCount(row.undated_attendances, 'sin fecha'),
    membershipStatus: toOptionalString(row.membership_status),
  };
}

/**
 * Read-only Admin RPC. The private staging tables have no direct client grants.
 * This service does not create a membership or edit a program's historical data.
 *
 * Once the migration is installed, the generated Supabase types can replace
 * this deliberately narrow typed adapter.
 */
export async function getAdminPreregistrationRecords(
  intakeProgramId: string | null = null,
): Promise<AdminPreregistrationRecord[]> {
  if (!preregistrationDirectoryEnabled) return [];
  const read = supabase.rpc.bind(supabase) as unknown as (
    name: 'admin_get_preregistered_program_records',
    args: { p_intake_program_id: string | null },
  ) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
  const { data, error } = await read('admin_get_preregistered_program_records', {
    p_intake_program_id: intakeProgramId,
  });
  if (error) throw new Error(error.message);
  if (!Array.isArray(data)) {
    throw new Error('Supabase no devolvió la lista de expedientes.');
  }
  return data.map(parseRow);
}

export function preregistrationLevelLabel(record: AdminPreregistrationRecord): string {
  if (record.programCode === 'puppy') return 'Puppy';
  if (record.programLevel === 'medio') return 'Intermedio';
  if (record.programLevel === 'avanzado') return 'Avanzado';
  return 'Básico';
}

export function preregistrationMemberLabel(record: AdminPreregistrationRecord): string {
  if (record.membershipStatus === 'preapproved') return 'Socio autorizado · pendiente de vincular cuenta';
  if (!record.linkedUserId) return 'Membresía no verificable antes de vincular cuenta';
  if (record.membershipStatus === 'active') return 'Socio activo';
  if (record.membershipStatus) return 'Membresía ' + record.membershipStatus;
  return 'Sin membresía registrada';
}

/**
 * Completes missing contact(s) on a pending provisional person.
 * Server checks role, uniqueness, and linked status; never edits official records.
 */
export async function adminCompletePreregistrationContact(
  personId: string,
  contacts: { email?: string; phone?: string },
  deliveryMethod: NoticeDeliveryMethod,
): Promise<void> {
  if (!preregistrationDirectoryEnabled) throw new Error('Preinscripciones no habilitadas.');
  await assertIntakePublishedNotice();
  const rpc = supabase.rpc.bind(supabase) as unknown as (
    name: 'admin_complete_preregistration_contact_with_notice',
    args: { p_person_id: string; p_owner_email: string | null; p_owner_phone: string | null; p_owner_method: NoticeDeliveryMethod },
  ) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
  const { data, error } = await rpc('admin_complete_preregistration_contact_with_notice', {
    p_person_id: personId,
    p_owner_email: contacts.email?.trim().toLowerCase() || null,
    p_owner_phone: contacts.phone?.trim() || null,
    p_owner_method: requireNoticeDeliveryMethod(deliveryMethod, 'el titular'),
  });
  if (error) throw new Error(error.message);
  if (!data || typeof data !== 'object' || Array.isArray(data)
      || (data as Record<string, unknown>).status !== 'updated') {
    throw new Error('Supabase no confirmó la actualización de contacto.');
  }
}

// La membresía provisional no crea perfiles, pagos ni roles. Solo Admin
// autoriza el estado que el backend convertirá a membresía real al vincular.
export async function adminSetPreregisteredMembership(
  intakeDogId: string, isMember: boolean,
): Promise<void> {
  if (!preregistrationDirectoryEnabled) {
    throw new Error('Directorio de preinscripciones no disponible.');
  }
  const rpc = supabase.rpc.bind(supabase) as unknown as (
    name: 'admin_set_preregistered_membership',
    args: {p_intake_dog_id: string; p_is_member: boolean},
  ) => PromiseLike<{error:{message:string}|null}>;
  const {error} = await rpc('admin_set_preregistered_membership',{
    p_intake_dog_id:intakeDogId,p_is_member:isMember,
  });
  if(error) throw new Error(error.message);
}
