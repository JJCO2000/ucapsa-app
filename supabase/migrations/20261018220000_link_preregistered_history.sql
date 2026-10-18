-- UCAPSA: enlazar prueba documental de asistencias sin fechas inventadas.
-- NO aplicar hasta superar pruebas SQL aisladas con roles, concurrencia y RLS.
alter table public.program_enrollments
  add column if not exists intake_program_id uuid unique
    references ucapsa_intake.programs(id) on delete restrict;

create table if not exists public.program_attendance_historical_evidence (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references public.program_enrollments(id) on delete restrict,
  intake_evidence_id uuid not null unique references ucapsa_intake.attendance_evidence(id) on delete restrict,
  evidence_kind text not null check(evidence_kind in ('dated','undated_balance')),
  attendance_date date,
  quantity integer not null check(quantity between 1 and 500),
  recorded_by uuid not null references auth.users(id) on delete restrict,
  recorded_at timestamptz not null,
  source_note text,
  constraint historical_evidence_provenance check (
    (evidence_kind='dated' and attendance_date is not null and quantity=1)
    or (evidence_kind='undated_balance' and attendance_date is null)
  )
);
create unique index if not exists historical_evidence_one_date
  on public.program_attendance_historical_evidence(enrollment_id,attendance_date)
  where evidence_kind='dated';
create unique index if not exists historical_evidence_one_balance
  on public.program_attendance_historical_evidence(enrollment_id)
  where evidence_kind='undated_balance';

alter table public.program_attendance_historical_evidence enable row level security;
revoke all on public.program_attendance_historical_evidence from public,anon,authenticated;
grant select,insert,update,delete on public.program_attendance_historical_evidence to service_role;

-- Evitar que una fecha histórica se vuelva a contabilizar como asistencia QR.
create or replace function public.guard_attendance_not_already_historical()
returns trigger language plpgsql security definer set search_path=''
as $fn$
begin
  if exists (
    select 1 from public.program_attendance_historical_evidence h
    where h.enrollment_id=new.enrollment_id
      and h.evidence_kind='dated' and h.attendance_date=new.attendance_date
  ) then
    raise exception 'Esta fecha ya está en el historial reconocido; corrige esa fuente antes de añadir otra asistencia.'
      using errcode='23505';
  end if;
  return new;
end;
$fn$;
drop trigger if exists trg_guard_attendance_history_duplicate on public.program_attendances;
create trigger trg_guard_attendance_history_duplicate before insert or update of enrollment_id,attendance_date
on public.program_attendances for each row
execute function public.guard_attendance_not_already_historical();

-- El trigger funciona también si se importan correcciones futuras.
create or replace function public.guard_history_not_already_attended()
returns trigger language plpgsql security definer set search_path=''
as $fn$
begin
  if new.evidence_kind='dated' and exists(
    select 1 from public.program_attendances a
    where a.enrollment_id=new.enrollment_id and a.attendance_date=new.attendance_date
  ) then
    raise exception 'Esta fecha ya fue registrada como asistencia ordinaria.' using errcode='23505';
  end if;
  return new;
end;
$fn$;
drop trigger if exists trg_guard_historical_date_duplicate on public.program_attendance_historical_evidence;
create trigger trg_guard_historical_date_duplicate before insert or update of enrollment_id,attendance_date
on public.program_attendance_historical_evidence for each row
execute function public.guard_history_not_already_attended();

-- No se toca el historial oficial existente. Se suma historial avalado por Admin.

CREATE OR REPLACE FUNCTION public.refresh_program_enrollment_progress(p_enrollment_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_program_id uuid;
  v_required integer;
  v_count integer;
  v_latest date;
  v_schedule_count integer;
  v_target_offset integer;
  v_next_schedule_id uuid;
begin
  select e.program_id, p.required_attendances
    into v_program_id, v_required
  from public.program_enrollments e
  join public.programs p on p.id = e.program_id
  where e.id = p_enrollment_id;

  if v_program_id is null then
    return;
  end if;

  -- La fuente canónica de progreso combina asistencias fechadas ordinarias
  -- con evidencia histórica identificada. La parte sin fecha suma SOLO cantidad.
  select coalesce(sum(a.qty),0)::int, max(a.attendance_date)
    into v_count, v_latest
  from (
    select 1::integer as qty, attendance_date
    from public.program_attendances where enrollment_id = p_enrollment_id
    union all
    select h.quantity as qty, h.attendance_date
    from public.program_attendance_historical_evidence h
    where h.enrollment_id = p_enrollment_id
  ) a;

  select count(*)::int
    into v_schedule_count
  from public.program_schedules s
  join lateral public.get_effective_program_schedule(s.id, (clock_timestamp() at time zone 'America/Mexico_City')::date) e on true
  where s.program_id = v_program_id
    and e.is_active = true;

  if v_schedule_count > 0 then
    v_target_offset := least(v_count, v_schedule_count - 1);

    select s.id
      into v_next_schedule_id
    from public.program_schedules s
    join lateral public.get_effective_program_schedule(s.id, (clock_timestamp() at time zone 'America/Mexico_City')::date) e on true
    where s.program_id = v_program_id
      and e.is_active = true
    order by e.sequence_order, e.day_of_week, e.start_time
    offset v_target_offset
    limit 1;
  end if;

  update public.program_enrollments
  set attendances_count = v_count,
      last_attendance_at = v_latest,
      schedule_id = coalesce(v_next_schedule_id, schedule_id),
      requirements_met_at = case
        when v_count >= greatest(1, v_required) then coalesce(requirements_met_at, now())
        else null
      end,
      updated_at = now()
  where id = p_enrollment_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.set_program_enrollment_card_validity()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  -- Tarjetas antiguas preinscritas sin fecha: jamás crear un inicio falso.
  if new.intake_program_id is not null and new.started_at is null
     and new.card_started_on is null then
    new.card_expires_on := null;
    return new;
  end if;
  -- En nuevas inscripciones sí podemos fijar el inicio si la app no lo manda.
  if tg_op = 'INSERT' and new.card_started_on is null then
    new.card_started_on := coalesce(new.started_at::date, current_date);
  elsif tg_op = 'UPDATE' and new.card_started_on is null and new.started_at is not null then
    -- Para legados solo usamos started_at real; nunca created_at como sustituto.
    new.card_started_on := new.started_at::date;
  end if;

  if new.card_expires_on is null and new.card_started_on is not null then
    new.card_expires_on := (new.card_started_on + interval '1 year')::date;
  end if;

  if new.card_started_on is not null
     and new.card_expires_on is not null
     and new.card_expires_on < new.card_started_on then
    raise exception 'La fecha de vencimiento no puede ser anterior al inicio de la tarjeta.';
  end if;

  return new;
end;
$function$;

drop trigger if exists trg_program_historical_refresh on public.program_attendance_historical_evidence;
create trigger trg_program_historical_refresh after insert or update or delete
on public.program_attendance_historical_evidence for each row
execute function public.trg_refresh_program_enrollment_progress();
revoke all on function public.guard_attendance_not_already_historical() from public,anon;
revoke all on function public.guard_history_not_already_attended() from public,anon;
