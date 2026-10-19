import { supabase } from '../lib/supabase';

export type AdminPreregistrationRow = {
  personId: string;
  dogId: string;
  programId: string;
  ownerName: string;
  email: string | null;
  phone: string | null;
  dogName: string;
  programCode: 'puppy' | 'comandos';
  programLevel: 'base' | 'principiante' | 'medio' | 'avanzado';
  scheduleId: string;
  physicalCardNumber: string | null;
  cardStartedOn: string | null;
  authorizedOn: string;
  historicalAttendances: number;
  staffAttendances: number;
  knownDates: string[];
  sourceNote: string | null;
};

function nullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}
function positiveOrZeroInteger(value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw new Error('Contador de preinscripción inválido.');
  }
  return Number(value);
}

function readRow(value: unknown): AdminPreregistrationRow {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Formato de preinscripción inesperado.');
  }
  const r = value as Record<string, unknown>;
  if (typeof r.intake_person_id !== 'string'
    || typeof r.intake_dog_id !== 'string'
    || typeof r.intake_program_id !== 'string'
    || typeof r.owner_name !== 'string'
    || typeof r.dog_name !== 'string'
    || typeof r.schedule_id !== 'string'
    || typeof r.authorized_on !== 'string'
    || (r.program_code !== 'puppy' && r.program_code !== 'comandos')
    || !['base', 'principiante', 'medio', 'avanzado'].includes(String(r.program_level))
    || !Array.isArray(r.known_dates)
    || !r.known_dates.every((date) => typeof date === 'string')) {
    throw new Error('El servidor devolvió datos provisionales incompletos.');
  }
  return {
    personId: r.intake_person_id,
    dogId: r.intake_dog_id,
    programId: r.intake_program_id,
    ownerName: r.owner_name,
    email: nullableString(r.owner_email),
    phone: nullableString(r.owner_phone),
    dogName: r.dog_name,
    programCode: r.program_code,
    programLevel: r.program_level as AdminPreregistrationRow['programLevel'],
    scheduleId: r.schedule_id,
    physicalCardNumber: nullableString(r.physical_card_number),
    cardStartedOn: nullableString(r.card_started_on),
    authorizedOn: r.authorized_on,
    historicalAttendances: positiveOrZeroInteger(r.historical_attendances),
    staffAttendances: positiveOrZeroInteger(r.staff_attendances),
    knownDates: r.known_dates as string[],
    sourceNote: nullableString(r.source_note),
  };
}

/** RPC nuevo solo Admin: no acceder a ucapsa_intake por SELECT directo. */
export async function getAdminPreregisteredDirectory(): Promise<AdminPreregistrationRow[]> {
  // Los tipos se regenerarán oficialmente tras instalar el RPC en Supabase.
  // El cast temporal queda encerrado en esta frontera concreta.
  const rpc = supabase.rpc.bind(supabase) as unknown as (
    name: 'admin_get_preregistered_directory',
  ) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
  const { data, error } = await rpc('admin_get_preregistered_directory');
  if (error) throw new Error(error.message);
  if (!Array.isArray(data)) throw new Error('No se pudo consultar el directorio provisional.');
  return data.map(readRow);
}

export async function updateAdminPreregisteredHistory(input: {
  dogId: string;
  programCode: 'puppy' | 'comandos';
  level: AdminPreregistrationRow['programLevel'];
  physicalCardNumber: string | null;
  cardStartedOn: string | null;
  totalHistoricalAttendances: number;
  knownDates: string[];
  sourceNote: string | null;
}): Promise<void> {
  const { error } = await supabase.rpc('admin_save_preregistered_program_history', {
    p_intake_dog_id: input.dogId,
    p_program_code: input.programCode,
    p_program_level: input.level,
    p_card_number: input.programCode === 'puppy' ? input.physicalCardNumber : null,
    p_card_started_on: input.programCode === 'puppy' ? input.cardStartedOn : null,
    p_total_attendances: input.totalHistoricalAttendances,
    p_known_dates: input.knownDates,
    p_note: input.sourceNote,
  });
  if (error) throw error;
}
