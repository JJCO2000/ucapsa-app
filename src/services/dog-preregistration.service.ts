import { supabase } from '../lib/supabase';

export type HistoricalAttendanceEvidence = {
  id: string;
  attendanceDate: string | null;
  quantity: number;
  kind: 'dated' | 'undated_balance';
  evidenceSource: 'staff_roster' | 'admin_history';
  sourceNote: string | null;
  recordedAt: string;
};

export async function getAdminProgramHistoricalEvidence(enrollmentId: string): Promise<HistoricalAttendanceEvidence[]> {
  const { data, error } = await supabase.rpc('admin_get_program_historical_evidence', {
    p_enrollment_id: enrollmentId,
  });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.evidence_id,
    attendanceDate: row.attendance_date,
    quantity: row.quantity,
    kind: row.evidence_kind === 'dated' ? 'dated' : 'undated_balance',
    evidenceSource: row.evidence_source === 'staff_roster' ? 'staff_roster' : 'admin_history',
    sourceNote: row.source_note,
    recordedAt: row.recorded_at,
  }));
}

export type DogClaimResult = {
  status: 'linked' | 'none' | 'unverified' | 'not_applicable' | 'conflict';
  linkedDogs: number;
};

export async function adminPreregisterDog(input: {
  ownerName: string;
  ownerEmail: string;
  ownerPhone: string;
  dogName: string;
}): Promise<string> {
  const { data, error } = await supabase.rpc('admin_preregister_dog', {
    p_owner_name: input.ownerName.trim(),
    p_owner_email: input.ownerEmail.trim(),
    p_owner_phone: input.ownerPhone.trim(),
    p_dog_name: input.dogName.trim(),
  });
  if (error) throw error;
  if (typeof data !== 'string' || !data) throw new Error('No se pudo confirmar la preinscripción.');
  return data;
}

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

// Una RPC: perro, programa, tarjeta y evidencia se confirman juntos.
export async function adminPreregisterDogWithProgram(input: PreregisteredProgramInput): Promise<string> {
  const { data, error } = await supabase.rpc('admin_preregister_dog_with_program', {
    p_owner_name: input.ownerName.trim(),
    p_owner_email: input.ownerEmail.trim(),
    p_owner_phone: input.ownerPhone.trim(),
    p_dog_name: input.dogName.trim(),
    p_program_code: input.programCode,
    p_program_level: input.programLevel,
    p_card_number: input.physicalCardNumber.trim(),
    p_card_started_on: input.cardStartedOn,
    p_total_attendances: input.totalAttendances,
    p_known_dates: input.knownAttendanceDates,
    p_note: input.sourceNote.trim() || null,
  });
  if (error) throw error;
  if (typeof data !== 'string' || !data) throw new Error('No se guardó la preinscripción.');
  return data;
}

export async function claimMyPreregisteredDogs(): Promise<DogClaimResult> {
  const { data, error } = await supabase.rpc('claim_my_preregistered_dogs');
  if (error) throw error;
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('Respuesta de vinculación inválida.');
  }
  const result = data as Record<string, unknown>;
  const status = result.status;
  if (status !== 'linked' && status !== 'none' && status !== 'unverified' &&
    status !== 'not_applicable' && status !== 'conflict') {
    throw new Error('Estado de vinculación inesperado.');
  }
  return {
    status,
    linkedDogs: typeof result.linked_dogs === 'number' ? result.linked_dogs : 0,
  };
}
