import { supabase } from '../lib/supabase';
import { preregistrationEnabled } from '../constants/preregistrationFeature';

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
  if (!preregistrationEnabled) return [];
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
  if (!record.linkedUserId) return 'Membresía no verificable antes de vincular cuenta';
  if (record.membershipStatus === 'active') return 'Socio activo';
  if (record.membershipStatus) return 'Membresía ' + record.membershipStatus;
  return 'Sin membresía registrada';
}
