import { preregistrationEnabled } from '../constants/preregistrationFeature';
import { callPreregistrationRpc } from './dog-preregistration.service';

export type StaffPreregisteredRosterRow = {
  intakeProgramId: string;
  scheduleId: string;
  programCode: 'puppy' | 'comandos';
  programLevel: string;
  startTime: string;
  dogName: string;
  ownerName: string;
  attended: boolean;
  authorizationStatus: 'valid' | 'not_started' | 'expired';
  totalAttendances: number;
};

export async function getStaffPreregisteredRoster(date: string): Promise<StaffPreregisteredRosterRow[]> {
  if (!preregistrationEnabled) return [];
  const { data } = await callPreregistrationRpc('get_staff_preregistered_class_roster', {
    p_class_date: date,
  });
  if (!Array.isArray(data)) throw new Error('El servidor no devolvió una lista de preinscritos.');
  return data.map((value: unknown) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('Registro provisional inválido.');
    }
    const r = value as Record<string, unknown>;
    if (typeof r.intake_program_id !== 'string' || typeof r.schedule_id !== 'string'
        || (r.program_code !== 'puppy' && r.program_code !== 'comandos')
        || typeof r.program_level !== 'string'
        || typeof r.dog_name !== 'string' || typeof r.owner_name !== 'string'
        || typeof r.start_time !== 'string'
        || typeof r.attended !== 'boolean'
        || (r.card_status !== 'valid' && r.card_status !== 'not_started' && r.card_status !== 'expired')
        || typeof r.total_attendances !== 'number') {
      throw new Error('Datos de asistencia provisional inconsistentes.');
    }
    return {
      intakeProgramId: r.intake_program_id,
      scheduleId: r.schedule_id,
      programCode: r.program_code,
      programLevel: r.program_level,
      startTime: r.start_time.slice(0, 5),
      dogName: r.dog_name,
      ownerName: r.owner_name,
      attended: r.attended,
      authorizationStatus: r.card_status,
      totalAttendances: r.total_attendances,
    };
  });
}

export async function registerStaffPreregisteredAttendance(input: {
  intakeProgramId: string;
  attendanceDate: string;
}): Promise<void> {
  await callPreregistrationRpc('staff_register_preregistered_attendance', {
    p_intake_program_id: input.intakeProgramId,
    p_attendance_date: input.attendanceDate,
  });
}
