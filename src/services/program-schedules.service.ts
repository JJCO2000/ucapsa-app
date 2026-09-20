import { supabase } from '../lib/supabase';
import type { ProgramSchedule, ProgramScheduleVersion, UcapsaProgram } from '../types/app.types';
import {
  effectiveVersionForDate,
  localTodayKey,
  normalizeProgram,
  normalizeSchedule,
  normalizeScheduleVersion,
  overlayScheduleVersion,
  sortProgramSchedules,
} from './programs.domain';

export type UpdateProgramScheduleInput = {
  name?: string;
  dayOfWeek?: number;
  startTime?: string;
  repeatType?: 'weekly' | 'biweekly';
  cycleStartDate?: string | null;
  sequenceOrder?: number;
  isActive?: boolean;
};

async function loadScheduleBasesAndVersions(
  scheduleIds?: string[],
): Promise<{ schedules: ProgramSchedule[]; versions: ProgramScheduleVersion[] }> {
  let scheduleQuery = supabase.from('program_schedules').select('*');
  let versionQuery = supabase.from('program_schedule_versions').select('*').is('retired_at', null);

  if (scheduleIds && scheduleIds.length > 0) {
    scheduleQuery = scheduleQuery.in('id', scheduleIds);
    versionQuery = versionQuery.in('schedule_id', scheduleIds);
  }

  const [scheduleResult, versionResult] = await Promise.all([scheduleQuery, versionQuery]);
  if (scheduleResult.error) throw scheduleResult.error;
  if (versionResult.error) throw versionResult.error;

  return {
    schedules: (scheduleResult.data ?? []).map(normalizeSchedule),
    versions: (versionResult.data ?? []).map(normalizeScheduleVersion),
  };
}

export async function getPrograms(): Promise<UcapsaProgram[]> {
  const { data, error } = await supabase
    .from('programs')
    .select('*')
    .order('name', { ascending: true });

  if (error) throw error;
  return (data ?? [])
    .map(normalizeProgram)
    .sort((a, b) => (a.code === 'puppy' ? -1 : 1) - (b.code === 'puppy' ? -1 : 1));
}

export async function getProgramSchedules(
  dateKey = localTodayKey(),
  scheduleIds?: string[],
): Promise<ProgramSchedule[]> {
  const bundle = await loadScheduleBasesAndVersions(scheduleIds);
  return sortProgramSchedules(
    bundle.schedules.map((schedule) =>
      overlayScheduleVersion(schedule, effectiveVersionForDate(bundle.versions, schedule.id, dateKey)),
    ),
  );
}

export async function getProgramScheduleTimeline(): Promise<ProgramSchedule[]> {
  const bundle = await loadScheduleBasesAndVersions();
  const bySchedule = new Map(bundle.schedules.map((schedule) => [schedule.id, schedule]));
  const rows = bundle.versions
    .filter((version) => !version.retired_at)
    .map((version) => {
      const base = bySchedule.get(version.schedule_id);
      return base ? overlayScheduleVersion(base, version) : null;
    })
    .filter(Boolean) as ProgramSchedule[];

  const versionedIds = new Set(rows.map((schedule) => schedule.id));
  for (const base of bundle.schedules) {
    if (!versionedIds.has(base.id)) rows.push(base);
  }

  return [...rows].sort((a, b) =>
    a.program_id.localeCompare(b.program_id)
    || a.sequence_order - b.sequence_order
    || String(a.effective_from ?? '').localeCompare(String(b.effective_from ?? ''))
    || a.start_time.localeCompare(b.start_time),
  );
}

export function getProgramScheduleFromTimeline(
  timeline: ProgramSchedule[],
  scheduleId: string,
  dateKey: string,
) {
  return timeline
    .filter((schedule) => schedule.id === scheduleId)
    .filter((schedule) =>
      (!schedule.effective_from || schedule.effective_from <= dateKey)
      && (!schedule.effective_to || schedule.effective_to >= dateKey),
    )
    .sort((a, b) =>
      String(b.effective_from ?? '').localeCompare(String(a.effective_from ?? '')),
    )[0] ?? null;
}

export async function changeProgramScheduleFromDate(
  scheduleId: string,
  effectiveFrom: string,
  input: UpdateProgramScheduleInput & { changeNote?: string | null },
): Promise<string> {
  const current = (await getProgramSchedules(effectiveFrom, [scheduleId]))
    .find((schedule) => schedule.id === scheduleId);
  if (!current) throw new Error('Horario no encontrado para esa fecha.');

  const dayOfWeek = 'dayOfWeek' in input
    ? Math.max(0, Math.min(6, Number(input.dayOfWeek ?? current.day_of_week)))
    : current.day_of_week;
  const repeatType = input.repeatType ?? current.repeat_type;
  const cycleStartDate = repeatType === 'biweekly'
    ? (input.cycleStartDate || effectiveFrom)
    : null;

  const { data, error } = await supabase.rpc('admin_change_program_schedule_from_date', {
    p_schedule_id: scheduleId,
    p_effective_from: effectiveFrom,
    p_name: input.name?.trim() || current.name,
    p_day_of_week: dayOfWeek,
    p_start_time: input.startTime || String(current.start_time).slice(0, 8),
    p_repeat_type: repeatType,
    p_cycle_start_date: cycleStartDate ?? undefined,
    p_sequence_order: Math.max(1, Number(input.sequenceOrder ?? current.sequence_order)),
    p_is_active: input.isActive ?? current.is_active,
    p_change_note: input.changeNote?.trim() || undefined,
  });

  if (error) throw error;
  if (!data) throw new Error('Supabase no devolvio la nueva version del horario.');
  return String(data);
}

export async function updateProgramSchedule(
  scheduleId: string,
  input: UpdateProgramScheduleInput,
): Promise<void> {
  await changeProgramScheduleFromDate(scheduleId, localTodayKey(), input);
}
