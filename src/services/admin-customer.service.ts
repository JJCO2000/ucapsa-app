import { supabase } from '../lib/supabase';
import { getProgramSchedules } from './programs.service';
import type { BasicDog } from './dogs.service';
import type {
  Membership,
  Payment,
  Profile,
  ProgramAttendance,
  ProgramEnrollment,
  ProgramEnrollmentWithDetails,
  ProgramSchedule,
  UcapsaProgram,
} from '../types/app.types';

export type AdminCustomerPayment = Payment & {
  obligation_id?: string | null;
};

export type AdminCustomerPaymentObligation = {
  id: string;
  user_id: string;
  membership_id: string | null;
  obligation_type: 'membership' | 'program' | 'service' | 'purchase' | 'other' | string;
  concept: string;
  period_start: string | null;
  period_end: string | null;
  due_date: string;
  amount: number;
  currency: string;
  source: string;
  cancelled_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type AdminCustomerRecord = {
  profile: Profile;
  membership: Membership | null;
  payments: AdminCustomerPayment[];
  obligations: AdminCustomerPaymentObligation[];
  enrollments: ProgramEnrollmentWithDetails[];
  dogs: BasicDog[];
};

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

export async function getAdminCustomerRecord(userId: string): Promise<AdminCustomerRecord> {
  const normalizedUserId = userId.trim();
  if (!normalizedUserId) throw new Error('Falta el usuario de la ficha.');

  const [profileResult, membershipResult, paymentsResult, enrollmentsResult, obligationsResult, dogsResult] = await Promise.all([
    supabase.from('profiles').select('*').eq('user_id', normalizedUserId).maybeSingle(),
    supabase.from('memberships').select('*').eq('user_id', normalizedUserId).maybeSingle(),
    supabase.from('payments').select('*').eq('user_id', normalizedUserId).order('created_at', { ascending: false }),
    supabase.from('program_enrollments').select('*').eq('user_id', normalizedUserId).order('created_at', { ascending: false }),
    supabase.from('payment_obligations').select('*').eq('user_id', normalizedUserId).order('due_date', { ascending: false }),
    supabase.from('dogs').select('id,name,is_active,created_at,updated_at').eq('user_id', normalizedUserId).eq('is_active', true).order('created_at', { ascending: true }),
  ]);

  if (profileResult.error) throw profileResult.error;
  if (!profileResult.data) throw new Error('No se encontro el perfil del cliente.');
  if (membershipResult.error) throw membershipResult.error;
  if (paymentsResult.error) throw paymentsResult.error;
  if (enrollmentsResult.error) throw enrollmentsResult.error;
  if (obligationsResult.error) throw obligationsResult.error;
  if (dogsResult.error) throw dogsResult.error;

  const profile = profileResult.data as Profile;
  const membership = (membershipResult.data ?? null) as Membership | null;
  const payments = (paymentsResult.data ?? []) as AdminCustomerPayment[];
  const obligations = (obligationsResult.data ?? []) as AdminCustomerPaymentObligation[];
  const enrollments = (enrollmentsResult.data ?? []) as ProgramEnrollment[];
  const dogs = ((dogsResult.data ?? []) as Array<Partial<BasicDog>>).map((item) => ({
    id: String(item.id ?? ''),
    name: String(item.name ?? ''),
    is_active: item.is_active !== false,
    created_at: String(item.created_at ?? ''),
    updated_at: String(item.updated_at ?? ''),
  })).filter((item) => item.id && item.name);

  if (enrollments.length === 0) {
    return { profile, membership, payments, obligations, enrollments: [], dogs };
  }

  const programIds = unique(enrollments.map((item) => item.program_id));
  const scheduleIds = unique(enrollments.map((item) => item.schedule_id));
  const enrollmentIds = unique(enrollments.map((item) => item.id));

  const [programsResult, currentSchedules, attendancesResult] = await Promise.all([
    supabase.from('programs').select('*').in('id', programIds),
    getProgramSchedules(),
    supabase.from('program_attendances').select('*').in('enrollment_id', enrollmentIds).order('attendance_date', { ascending: false }),
  ]);

  if (programsResult.error) throw programsResult.error;
  if (attendancesResult.error) throw attendancesResult.error;

  const programsById = ((programsResult.data ?? []) as UcapsaProgram[]).reduce<Record<string, UcapsaProgram>>((acc, item) => {
    acc[item.id] = item;
    return acc;
  }, {});

  const schedulesById = currentSchedules.filter((item) => scheduleIds.includes(item.id)).reduce<Record<string, ProgramSchedule>>((acc, item) => {
    acc[item.id] = item;
    return acc;
  }, {});

  const attendancesByEnrollment = ((attendancesResult.data ?? []) as ProgramAttendance[]).reduce<Record<string, ProgramAttendance[]>>((acc, item) => {
    acc[item.enrollment_id] = acc[item.enrollment_id] ?? [];
    acc[item.enrollment_id].push(item);
    return acc;
  }, {});

  const detailedEnrollments = enrollments.flatMap<ProgramEnrollmentWithDetails>((enrollment) => {
    const program = programsById[enrollment.program_id];
    const schedule = schedulesById[enrollment.schedule_id];
    if (!program || !schedule) return [];

    return [{
      enrollment,
      program,
      schedule,
      profile,
      attendances: attendancesByEnrollment[enrollment.id] ?? [],
    }];
  });

  return {
    profile,
    membership,
    payments,
    obligations,
    enrollments: detailedEnrollments,
    dogs,
  };
}
