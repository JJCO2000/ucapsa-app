import { supabase } from '../lib/supabase';
import type { TableInsert } from '../types/database.helpers';
import type { ProgramClassCancellation } from '../types/app.types';
import {
  formatProgramScheduleDetailLabel,
  formatProgramScheduleName,
  isProgramScheduleActiveOnDate,
  normalizeClassCancellation,
} from './programs.domain';
import {
  getProgramScheduleFromTimeline,
  getProgramScheduleTimeline,
  getProgramSchedules,
  getPrograms,
} from './programs-core.service';
import { getProgramServiceCurrentUserId } from './programs-session.internal';

export type CreateProgramClassCancellationInput = {
  scheduleId: string;
  cancellationDate: string;
  reason?: string | null;
  createAnnouncement?: boolean;
};

export type CreateProgramDayCancellationsInput = {
  scheduleIds: string[];
  cancellationDate: string;
  reason?: string | null;
  createAnnouncement?: boolean;
};

export async function getProgramClassCancellations(includeRestored = false): Promise<ProgramClassCancellation[]> {
  let query = supabase
    .from('program_class_cancellations')
    .select('*, schedule:program_schedules(*)')
    .order('cancellation_date', { ascending: true })
    .order('created_at', { ascending: false });

  if (!includeRestored) query = query.is('restored_at', null);

  const { data, error } = await query;
  if (error) throw error;
  const items = (data ?? []).map(normalizeClassCancellation);
  if (items.length === 0) return [];

  const timeline = await getProgramScheduleTimeline();
  return items.map((item) => ({
    ...item,
    schedule: getProgramScheduleFromTimeline(timeline, item.schedule_id, item.cancellation_date) ?? item.schedule ?? null,
  }));
}

export async function getProgramClassCancellationByAnnouncementId(announcementId: string): Promise<ProgramClassCancellation | null> {
  const cleanId = announcementId.trim();
  if (!cleanId) return null;

  const { data, error } = await supabase
    .from('program_class_cancellations')
    .select('*, schedule:program_schedules(*)')
    .eq('announcement_id', cleanId)
    .maybeSingle();

  if (error) throw error;
  return data ? normalizeClassCancellation(data) : null;
}

async function getActiveCancellationForScheduleDate(scheduleId: string, dateKey: string): Promise<ProgramClassCancellation | null> {
  const { data, error } = await supabase
    .from('program_class_cancellations')
    .select('*')
    .eq('schedule_id', scheduleId)
    .eq('cancellation_date', dateKey)
    .is('restored_at', null)
    .maybeSingle();

  if (error) throw error;
  return data ? normalizeClassCancellation(data) : null;
}

export async function createProgramClassCancellation(input: CreateProgramClassCancellationInput): Promise<ProgramClassCancellation> {
  const userId = await getProgramServiceCurrentUserId();
  const reason = input.reason?.trim() || 'Clase cancelada por UCAPSA.';

  const [effectiveSchedules, programs] = await Promise.all([
    getProgramSchedules(input.cancellationDate),
    getPrograms(),
  ]);
  const schedule = effectiveSchedules.find((item) => item.id === input.scheduleId) ?? null;
  if (!schedule) throw new Error('Horario no encontrado para esa fecha.');
  const program = programs.find((item) => item.id === schedule.program_id) ?? null;

  if (!isProgramScheduleActiveOnDate(schedule, input.cancellationDate)) {
    throw new Error('Este horario no tiene clase programada ese dia.');
  }

  const existingCancellation = await getActiveCancellationForScheduleDate(input.scheduleId, input.cancellationDate);
  if (existingCancellation) {
    throw new Error('Esta clase ya esta cancelada para esa fecha.');
  }

  const { data, error } = await supabase
    .from('program_class_cancellations')
    .insert({
      schedule_id: input.scheduleId,
      cancellation_date: input.cancellationDate,
      reason,
      created_by: userId,
    })
    .select('*, schedule:program_schedules(*)')
    .single();

  if (error) throw error;

  const cancellation = normalizeClassCancellation(data);

  if (input.createAnnouncement !== false) {
    const className = formatProgramScheduleName(schedule, program);
    const classDetail = formatProgramScheduleDetailLabel(schedule);
    const title = `Clase cancelada - ${className}`;
    const content = `${program?.name ?? 'Clase UCAPSA'} - ${className} (${classDetail}) del ${input.cancellationDate} queda cancelada. Motivo: ${reason}`;
    const { data: announcementData, error: announcementError } = await supabase
      .from('announcements')
      .insert({
        title,
        content,
        audience: 'public',
        is_pinned: true,
        is_published: true,
        event_id: null,
        announcement_date: input.cancellationDate,
        color_key: 'red',
        priority: 'high',
        created_by: userId,
      })
      .select('id')
      .single();

    if (announcementError) throw announcementError;

    const announcementId = (announcementData as { id: string }).id;
    const { data: updatedData, error: updateError } = await supabase
      .from('program_class_cancellations')
      .update({ announcement_id: announcementId, updated_at: new Date().toISOString() })
      .eq('id', cancellation.id)
      .select('*, schedule:program_schedules(*)')
      .single();

    if (updateError) throw updateError;
    return normalizeClassCancellation(updatedData);
  }

  return cancellation;
}


export async function createProgramDayCancellations(input: CreateProgramDayCancellationsInput): Promise<ProgramClassCancellation[]> {
  const userId = await getProgramServiceCurrentUserId();
  const reason = input.reason?.trim() || 'Clases canceladas por UCAPSA.';
  const uniqueScheduleIds = [...new Set(input.scheduleIds.map((item) => item.trim()).filter(Boolean))];

  if (uniqueScheduleIds.length === 0) {
    throw new Error('No hay clases disponibles para cancelar ese dia.');
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.cancellationDate)) {
    throw new Error('La fecha debe tener formato AAAA-MM-DD.');
  }

  const [effectiveSchedules, programs] = await Promise.all([
    getProgramSchedules(input.cancellationDate),
    getPrograms(),
  ]);
  const programById = new Map(programs.map((program) => [program.id, program]));
  const rows = effectiveSchedules
    .filter((schedule) => uniqueScheduleIds.includes(schedule.id))
    .map((schedule) => ({ ...schedule, program: programById.get(schedule.program_id) ?? null }));
  const validRows = rows.filter((schedule) => isProgramScheduleActiveOnDate(schedule, input.cancellationDate));

  if (validRows.length === 0) {
    throw new Error('No hay clases programadas para cancelar ese dia.');
  }

  const { data: existingData, error: existingError } = await supabase
    .from('program_class_cancellations')
    .select('*')
    .in('schedule_id', validRows.map((schedule) => schedule.id))
    .eq('cancellation_date', input.cancellationDate)
    .is('restored_at', null);

  if (existingError) throw existingError;

  const existingScheduleIds = new Set((existingData ?? []).map((item) => normalizeClassCancellation(item).schedule_id));
  const rowsToCancel = validRows.filter((schedule) => !existingScheduleIds.has(schedule.id));

  if (rowsToCancel.length === 0) {
    throw new Error('Todas las clases de ese dia ya estan canceladas.');
  }

  let announcementId: string | null = null;

  if (input.createAnnouncement !== false) {
    const classList = rowsToCancel
      .map((schedule) => `${schedule.program?.name ?? 'Clase UCAPSA'} - ${formatProgramScheduleName(schedule, schedule.program ?? null)}`)
      .join(', ');

    const { data: announcementData, error: announcementError } = await supabase
      .from('announcements')
      .insert({
        title: 'Clases canceladas',
        content: `Las clases UCAPSA del ${input.cancellationDate} quedan canceladas. Clases: ${classList}. Motivo: ${reason}`,
        audience: 'public',
        is_pinned: true,
        is_published: true,
        event_id: null,
        announcement_date: input.cancellationDate,
        color_key: 'red',
        priority: 'high',
        created_by: userId,
      })
      .select('id')
      .single();

    if (announcementError) throw announcementError;
    announcementId = (announcementData as { id: string }).id;
  }

  const payload = rowsToCancel.map((schedule) => ({
    schedule_id: schedule.id,
    cancellation_date: input.cancellationDate,
    reason,
    announcement_id: announcementId,
    created_by: userId,
  }));

  const { data, error } = await supabase
    .from('program_class_cancellations')
    .insert(payload as TableInsert<'program_class_cancellations'>[])
    .select('*, schedule:program_schedules(*)');

  if (error) throw error;
  return (data ?? []).map(normalizeClassCancellation);
}


export async function restoreProgramClassCancellation(cancellationId: string): Promise<void> {
  const userId = await getProgramServiceCurrentUserId();
  const now = new Date().toISOString();

  const { data, error: loadError } = await supabase
    .from('program_class_cancellations')
    .select('*')
    .eq('id', cancellationId)
    .single();

  if (loadError) throw loadError;

  const cancellation = normalizeClassCancellation(data);

  const { error } = await supabase
    .from('program_class_cancellations')
    .update({ restored_at: now, restored_by: userId, updated_at: now })
    .eq('id', cancellationId);

  if (error) throw error;

  if (cancellation.announcement_id) {
    const { error: announcementError } = await supabase
      .from('announcements')
      .update({ is_published: false, archived_at: now })
      .eq('id', cancellation.announcement_id);

    if (announcementError) throw announcementError;
  }
}
