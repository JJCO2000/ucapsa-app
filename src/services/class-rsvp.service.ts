import { supabase } from '../lib/supabase';

export type ClassRsvpResponse = 'yes' | 'no';

export type MyClassRsvp = {
  enrollmentId: string;
  classDate: string;
  response: ClassRsvpResponse;
  respondedAt: string;
};

export type AdminClassRsvpSummary = {
  scheduleId: string;
  programCode: string;
  programName: string;
  programLevel: string;
  scheduleName: string;
  startTime: string;
  eligibleCount: number;
  confirmedCount: number;
  declinedCount: number;
  noResponseCount: number;
};

export function localDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Mexico_City',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

export function tomorrowDateKey(date = new Date()) {
  const today = localDateKey(date);
  const [year, month, day] = today.split('-').map(Number);
  const tomorrow = new Date(Date.UTC(year, month - 1, day + 1, 12, 0, 0, 0));
  return `${tomorrow.getUTCFullYear()}-${String(tomorrow.getUTCMonth() + 1).padStart(2, '0')}-${String(tomorrow.getUTCDate()).padStart(2, '0')}`;
}

export async function getMyClassRsvp(
  enrollmentId: string,
  classDate: string,
): Promise<MyClassRsvp | null> {
  const { data, error } = await supabase.rpc('get_my_class_rsvp', {
    p_enrollment_id: enrollmentId,
    p_class_date: classDate,
  });
  if (error) throw error;
  const row = data?.[0] ?? null;
  if (!row) return null;
  return {
    enrollmentId: row.enrollment_id,
    classDate: row.class_date,
    response: row.response as ClassRsvpResponse,
    respondedAt: row.responded_at,
  };
}

export async function setMyClassRsvp(
  enrollmentId: string,
  classDate: string,
  response: ClassRsvpResponse,
): Promise<MyClassRsvp> {
  const { data, error } = await supabase.rpc('set_my_class_rsvp', {
    p_enrollment_id: enrollmentId,
    p_class_date: classDate,
    p_response: response,
  });
  if (error) throw error;
  const row = data?.[0] ?? null;
  if (!row) throw new Error('UCAPSA no devolvió la confirmación de clase.');
  return {
    enrollmentId: row.enrollment_id,
    classDate: row.class_date,
    response: row.response as ClassRsvpResponse,
    respondedAt: row.responded_at,
  };
}

export async function getAdminClassRsvpSummary(
  classDate = tomorrowDateKey(),
): Promise<AdminClassRsvpSummary[]> {
  const { data, error } = await supabase.rpc('get_admin_class_rsvp_summary', {
    p_class_date: classDate,
  });
  if (error) throw error;

  return (data ?? []).map((row) => ({
    scheduleId: row.schedule_id,
    programCode: row.program_code,
    programName: row.program_name,
    programLevel: row.program_level,
    scheduleName: row.schedule_name,
    startTime: String(row.start_time ?? '').slice(0, 5),
    eligibleCount: Number(row.eligible_count ?? 0),
    confirmedCount: Number(row.confirmed_count ?? 0),
    declinedCount: Number(row.declined_count ?? 0),
    noResponseCount: Number(row.no_response_count ?? 0),
  }));
}
