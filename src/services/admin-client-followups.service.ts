import { supabase } from '../lib/supabase';

export type AdminClientFollowupRow = {
  userId: string;
  dogId: string;
  customerName: string;
  customerEmail: string | null;
  customerPhone: string | null;
  dogName: string;
  lastAttendanceDate: string | null;
  puppyCompletedOn: string | null;
  puppyNoContinuity: boolean;
  inactive30d: boolean;
  inactivityDays: number;
  puppyDaysSinceCompletion: number;
};

export async function getAdminClientFollowupRows(): Promise<AdminClientFollowupRow[]> {
  const { data, error } = await supabase.rpc('get_admin_client_followups');
  if (error) throw error;

  return (data ?? []).map((row) => ({
    userId: String(row.user_id ?? ''),
    dogId: String(row.dog_id ?? ''),
    customerName: String(row.customer_name ?? 'Cliente UCAPSA'),
    customerEmail: row.customer_email ?? null,
    customerPhone: row.customer_phone ?? null,
    dogName: String(row.dog_name ?? 'Perro'),
    lastAttendanceDate: row.last_attendance_date ?? null,
    puppyCompletedOn: row.puppy_completed_on ?? null,
    puppyNoContinuity: Boolean(row.puppy_no_continuity),
    inactive30d: Boolean(row.inactive_30d),
    inactivityDays: Number(row.inactivity_days ?? 0),
    puppyDaysSinceCompletion: Number(row.puppy_days_since_completion ?? 0),
  })).filter((row) => row.userId && row.dogId);
}
