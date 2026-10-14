import { supabase } from '../lib/supabase';
import type { TableRow } from '../types/database.helpers';

export type IntroAgendaStatus = 'planned' | 'yes' | 'no' | 'cancelled';
export type IntroAgendaPlan = TableRow<'intro_class_agenda_plans'> & { status: IntroAgendaStatus };

export function isSaturdayIntroClass(input: {
  programCode?: string | null;
  dayOfWeek: number;
  time: string;
  sequenceOrder?: number | null;
}) {
  return input.programCode === 'puppy' && input.dayOfWeek === 6
    && input.time.slice(0, 5) === '10:00' && input.sequenceOrder === 1;
}

export async function getMyIntroAgendaPlans(userId: string, startDate: string, endDate: string): Promise<IntroAgendaPlan[]> {
  if (!userId) return [];
  const { data, error } = await supabase.from('intro_class_agenda_plans')
    .select('*').eq('user_id', userId).gte('class_date', startDate).lte('class_date', endDate);
  if (error) throw error;
  return (data ?? []) as IntroAgendaPlan[];
}

export async function saveMyIntroAgendaPlan(dogId: string, classDate: string, status: IntroAgendaStatus): Promise<IntroAgendaPlan> {
  const { data, error } = await supabase.rpc('save_intro_class_agenda_plan', {
    p_dog_id: dogId,
    p_class_date: classDate,
    p_status: status,
  });
  if (error) throw error;
  const row = data?.[0];
  if (!row) throw new Error('No pudimos confirmar que la visita se guardó.');
  return row as IntroAgendaPlan;
}

export type StaffIntroVisit = IntroAgendaPlan & { clientName: string; dogName: string };
export async function getStaffIntroAgendaPlans(classDate: string): Promise<StaffIntroVisit[]> {
  const { data, error } = await supabase.rpc('get_staff_intro_class_agenda', { p_class_date: classDate });
  if (error) throw error;
  return (data ?? []).map(row => ({
    id: row.id,
    user_id: row.user_id,
    dog_id: row.dog_id,
    schedule_id: row.schedule_id,
    class_date: row.class_date,
    status: row.status as IntroAgendaStatus,
    created_at: '',
    updated_at: '',
    clientName: row.client_name,
    dogName: row.dog_name,
  }));
}
