import { supabase } from '../lib/supabase';
import type { TableUpdate } from '../types/database.helpers';
import type {
  Profile,
  ProgramAttendance,
  ProgramDogLink,
  ProgramEnrollment,
  ProgramEnrollmentStatus,
  ProgramEnrollmentWithDetails,
  ProgramLevel,
  UcapsaProgram,
} from '../types/app.types';
import { localTodayKey, normalizeEnrollment } from './programs.domain';
import { getProgramSchedules } from './program-schedules.service';
import { getProgramServiceCurrentUserId } from './programs-session.internal';

export type CreateProgramEnrollmentInput = {
  userId: string;
  programId: string;
  scheduleId: string;
  dogId?: string | null;
  dogName: string;
  physicalCardNumber?: string | null;
  programLevel?: ProgramLevel;
  notes?: string | null;
};

export type UpdateProgramEnrollmentInput = {
  programId?: string;
  scheduleId?: string;
  dogId?: string | null;
  dogName?: string;
  physicalCardNumber?: string | null;
  programLevel?: ProgramLevel;
  status?: ProgramEnrollmentStatus;
  notes?: string | null;
};

async function hydrateEnrollments(
  enrollments: ProgramEnrollment[],
): Promise<ProgramEnrollmentWithDetails[]> {
  if (enrollments.length === 0) return [];

  const programIds = [...new Set(enrollments.map((item) => item.program_id))];
  const scheduleIds = [...new Set(enrollments.map((item) => item.schedule_id))];
  const userIds = [...new Set(enrollments.map((item) => item.user_id))];
  const enrollmentIds = enrollments.map((item) => item.id);
  const dogIds = [...new Set(
    enrollments
      .map((item) => item.dog_id)
      .filter((value): value is string => Boolean(value)),
  )];

  const [programsResult, scheduleRows, profilesResult, attendancesResult, dogsResult] = await Promise.all([
    supabase.from('programs').select('*').in('id', programIds),
    getProgramSchedules(localTodayKey(), scheduleIds),
    supabase.from('profiles').select('*').in('user_id', userIds),
    supabase
      .from('program_attendances')
      .select('*')
      .in('enrollment_id', enrollmentIds)
      .order('attendance_date', { ascending: false }),
    dogIds.length > 0
      ? supabase.from('dogs').select('id,name,is_active,created_at,updated_at').in('id', dogIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (programsResult.error) throw programsResult.error;
  if (profilesResult.error) throw profilesResult.error;
  if (attendancesResult.error) throw attendancesResult.error;
  if (dogsResult.error) throw dogsResult.error;

  const programs = ((programsResult.data ?? []) as UcapsaProgram[])
    .reduce<Record<string, UcapsaProgram>>((acc, item) => {
      acc[item.id] = item;
      return acc;
    }, {});

  const schedules = scheduleRows.reduce<Record<string, (typeof scheduleRows)[number]>>((acc, item) => {
    acc[item.id] = item;
    return acc;
  }, {});

  const profiles = ((profilesResult.data ?? []) as Profile[])
    .reduce<Record<string, Profile>>((acc, item) => {
      acc[item.user_id] = item;
      return acc;
    }, {});

  const dogs = ((dogsResult.data ?? []) as ProgramDogLink[])
    .reduce<Record<string, ProgramDogLink>>((acc, item) => {
      acc[item.id] = item;
      return acc;
    }, {});

  const attendances = ((attendancesResult.data ?? []) as ProgramAttendance[])
    .reduce<Record<string, ProgramAttendance[]>>((acc, item) => {
      if (!acc[item.enrollment_id]) acc[item.enrollment_id] = [];
      acc[item.enrollment_id].push(item);
      return acc;
    }, {});

  return enrollments
    .map((enrollment) => {
      const program = programs[enrollment.program_id];
      const schedule = schedules[enrollment.schedule_id];
      if (!program || !schedule) return null;
      return {
        enrollment,
        program,
        schedule,
        profile: profiles[enrollment.user_id] ?? null,
        dog: enrollment.dog_id ? dogs[enrollment.dog_id] ?? null : null,
        attendances: attendances[enrollment.id] ?? [],
      } satisfies ProgramEnrollmentWithDetails;
    })
    .filter(Boolean) as ProgramEnrollmentWithDetails[];
}

export async function getMyProgramEnrollments(): Promise<ProgramEnrollmentWithDetails[]> {
  const userId = await getProgramServiceCurrentUserId();
  if (!userId) return [];

  const { data, error } = await supabase
    .from('program_enrollments')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return hydrateEnrollments((data ?? []).map(normalizeEnrollment));
}

export async function getAdminProgramRows(): Promise<ProgramEnrollmentWithDetails[]> {
  const { data, error } = await supabase
    .from('program_enrollments')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return hydrateEnrollments((data ?? []).map(normalizeEnrollment));
}

export async function getProgramClientProfiles(): Promise<Profile[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .in('role', ['client', 'member'])
    .order('full_name', { ascending: true });

  if (error) throw error;
  return (data ?? []) as Profile[];
}

export async function createProgramEnrollment(
  input: CreateProgramEnrollmentInput,
): Promise<ProgramEnrollment> {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('program_enrollments')
    .insert({
      user_id: input.userId,
      program_id: input.programId,
      schedule_id: input.scheduleId,
      dog_id: input.dogId?.trim() || null,
      dog_name: input.dogName.trim(),
      physical_card_number: input.physicalCardNumber?.trim() || null,
      status: 'active',
      attendances_count: 0,
      program_level: input.programLevel ?? 'base',
      last_attendance_at: null,
      notes: input.notes?.trim() || null,
      started_at: now.slice(0, 10),
    })
    .select('*')
    .single();

  if (error) throw error;
  return normalizeEnrollment(data);
}

export async function updateProgramEnrollment(
  enrollmentId: string,
  input: UpdateProgramEnrollmentInput,
): Promise<void> {
  const now = new Date().toISOString();
  const payload: Record<string, string | number | null> = { updated_at: now };

  if ('programId' in input) payload.program_id = input.programId ?? null;
  if ('scheduleId' in input) payload.schedule_id = input.scheduleId ?? null;
  if ('dogId' in input) payload.dog_id = input.dogId?.trim() || null;
  if ('dogName' in input) payload.dog_name = input.dogName?.trim() || null;
  if ('physicalCardNumber' in input) {
    payload.physical_card_number = input.physicalCardNumber?.trim() || null;
  }
  if ('programLevel' in input && input.programLevel) payload.program_level = input.programLevel;
  if ('status' in input && input.status) {
    payload.status = input.status;
    payload.completed_at = input.status === 'completed' ? now : null;
    payload.cancelled_at = input.status === 'cancelled' ? now : null;
  }
  if ('notes' in input) payload.notes = input.notes?.trim() || null;

  const { error } = await supabase
    .from('program_enrollments')
    .update(payload as TableUpdate<'program_enrollments'>)
    .eq('id', enrollmentId);
  if (error) throw error;
}

export async function setProgramEnrollmentStatus(
  enrollmentId: string,
  status: ProgramEnrollmentStatus,
): Promise<void> {
  await updateProgramEnrollment(enrollmentId, { status });
}

export async function getProgramEnrollmentByQrToken(
  qrToken: string,
): Promise<ProgramEnrollmentWithDetails | null> {
  const cleanToken = qrToken.trim();
  if (!cleanToken) return null;

  const { data, error } = await supabase
    .from('program_enrollments')
    .select('*')
    .eq('qr_token', cleanToken)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const rows = await hydrateEnrollments([normalizeEnrollment(data)]);
  return rows[0] ?? null;
}
