-- UCAPSA — rol Entrenador y superficie operativa de staff
--
-- Principios:
-- - mínimo privilegio: Entrenador no hereda Admin ni Superadmin;
-- - operación primero: clases, asistencia, exámenes, notas internas y solicitud de revisión de socio;
-- - sin pagos, estadísticas globales de visitas, comunicación ni configuración;
-- - las notas internas de perros son historial de staff, nunca datos visibles al cliente;
-- - una confirmación RSVP nunca sustituye la asistencia real.

begin;

create or replace function public.is_ucapsa_trainer()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.user_id = auth.uid()
      and p.role::text = 'trainer'
  )
$$;

create or replace function public.is_ucapsa_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.user_id = auth.uid()
      and p.role::text in ('trainer', 'admin', 'super_admin')
  )
$$;

revoke all on function public.is_ucapsa_trainer() from public, anon;
revoke all on function public.is_ucapsa_staff() from public, anon;
grant execute on function public.is_ucapsa_trainer() to authenticated, service_role;
grant execute on function public.is_ucapsa_staff() to authenticated, service_role;

-- Superadmin puede asignar/quitar el rol operativo. No se permite editar
-- cuentas superadmin desde esta superficie.
create or replace function public.superadmin_set_profile_role(
  p_user_id uuid,
  p_role text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_role text;
  v_before_role text;
  v_role text := lower(btrim(coalesce(p_role, '')));
begin
  select p.role::text into v_actor_role
  from public.profiles p
  where p.user_id = auth.uid();

  if v_actor_role <> 'super_admin' then
    raise exception 'Solo Superadmin puede cambiar roles de staff.'
      using errcode = '42501';
  end if;

  if v_role not in ('client', 'trainer', 'admin') then
    raise exception 'Rol no permitido desde esta herramienta.'
      using errcode = '22023';
  end if;

  select p.role::text into v_before_role
  from public.profiles p
  where p.user_id = p_user_id
  for update;

  if v_before_role is null then
    raise exception 'Perfil no encontrado.' using errcode = '22023';
  end if;

  if v_before_role = 'super_admin' then
    raise exception 'Una cuenta Superadmin no se modifica desde esta herramienta.'
      using errcode = '42501';
  end if;

  update public.profiles
  set role = v_role::public.app_role,
      updated_at = clock_timestamp()
  where user_id = p_user_id;

  insert into public.admin_audit_logs (
    admin_user_id, action, entity_type, entity_id, details
  ) values (
    auth.uid(),
    'profile.staff_role_change',
    'profile',
    p_user_id,
    jsonb_build_object('before_role', v_before_role, 'after_role', v_role)
  );

  return v_role;
end;
$$;

revoke all on function public.superadmin_set_profile_role(uuid,text) from public, anon;
grant execute on function public.superadmin_set_profile_role(uuid,text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Historial interno de perros para continuidad y seguridad operativa.
-- ---------------------------------------------------------------------------

create table if not exists public.ucapsa_staff_dog_notes (
  id uuid primary key default gen_random_uuid(),
  dog_id uuid not null references public.dogs(id) on delete cascade,
  note_type text not null default 'general',
  severity text not null default 'info',
  note text not null,
  happened_on date not null default ((clock_timestamp() at time zone 'America/Mexico_City')::date),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint ucapsa_staff_dog_notes_type_check
    check (note_type = any (array['general'::text, 'behavior'::text, 'incident'::text, 'training'::text, 'health_context'::text])),
  constraint ucapsa_staff_dog_notes_severity_check
    check (severity = any (array['info'::text, 'caution'::text, 'high'::text])),
  constraint ucapsa_staff_dog_notes_note_check
    check (length(btrim(note)) between 1 and 2000)
);

create index if not exists ucapsa_staff_dog_notes_dog_idx
  on public.ucapsa_staff_dog_notes (dog_id, happened_on desc, created_at desc);

alter table public.ucapsa_staff_dog_notes enable row level security;
revoke all on table public.ucapsa_staff_dog_notes from public, anon, authenticated;
grant select, insert, update, delete on table public.ucapsa_staff_dog_notes to service_role;

create or replace function public.get_staff_dog_notes(p_dog_id uuid)
returns table (
  id uuid,
  dog_id uuid,
  note_type text,
  severity text,
  note text,
  happened_on date,
  created_by uuid,
  updated_by uuid,
  resolved_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_ucapsa_staff() then
    raise exception 'Solo staff UCAPSA puede consultar notas internas.'
      using errcode = '42501';
  end if;

  return query
  select
    n.id,
    n.dog_id,
    n.note_type,
    n.severity,
    n.note,
    n.happened_on,
    n.created_by,
    n.updated_by,
    n.resolved_at,
    n.created_at,
    n.updated_at
  from public.ucapsa_staff_dog_notes n
  where n.dog_id = p_dog_id
  order by
    case n.severity when 'high' then 0 when 'caution' then 1 else 2 end,
    n.resolved_at nulls first,
    n.happened_on desc,
    n.created_at desc;
end;
$$;

create or replace function public.staff_add_dog_note(
  p_dog_id uuid,
  p_note_type text,
  p_severity text,
  p_note text,
  p_happened_on date default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_type text := lower(btrim(coalesce(p_note_type, 'general')));
  v_severity text := lower(btrim(coalesce(p_severity, 'info')));
  v_note text := btrim(coalesce(p_note, ''));
begin
  if not public.is_ucapsa_staff() then
    raise exception 'Solo staff UCAPSA puede registrar notas internas.'
      using errcode = '42501';
  end if;
  if not exists (select 1 from public.dogs d where d.id = p_dog_id) then
    raise exception 'Perro no encontrado.' using errcode = '22023';
  end if;
  if v_type not in ('general','behavior','incident','training','health_context') then
    raise exception 'Tipo de nota no válido.' using errcode = '22023';
  end if;
  if v_severity not in ('info','caution','high') then
    raise exception 'Severidad no válida.' using errcode = '22023';
  end if;
  if length(v_note) < 1 or length(v_note) > 2000 then
    raise exception 'La nota debe contener entre 1 y 2000 caracteres.'
      using errcode = '22023';
  end if;

  insert into public.ucapsa_staff_dog_notes (
    dog_id, note_type, severity, note, happened_on, created_by, updated_by
  ) values (
    p_dog_id,
    v_type,
    v_severity,
    v_note,
    coalesce(p_happened_on, (clock_timestamp() at time zone 'America/Mexico_City')::date),
    auth.uid(),
    auth.uid()
  )
  returning id into v_id;

  insert into public.admin_audit_logs (
    admin_user_id, action, entity_type, entity_id, details
  ) values (
    auth.uid(),
    'staff_dog_note.create',
    'dog',
    p_dog_id,
    jsonb_build_object('note_id', v_id, 'note_type', v_type, 'severity', v_severity)
  );

  return v_id;
end;
$$;

create or replace function public.staff_update_dog_note(
  p_note_id uuid,
  p_note_type text,
  p_severity text,
  p_note text,
  p_happened_on date
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before public.ucapsa_staff_dog_notes%rowtype;
  v_after public.ucapsa_staff_dog_notes%rowtype;
begin
  if not public.is_ucapsa_staff() then
    raise exception 'Solo staff UCAPSA puede editar notas internas.'
      using errcode = '42501';
  end if;

  select * into v_before
  from public.ucapsa_staff_dog_notes
  where id = p_note_id
  for update;

  if not found then raise exception 'Nota no encontrada.' using errcode = '22023'; end if;

  update public.ucapsa_staff_dog_notes
  set
    note_type = lower(btrim(coalesce(p_note_type, note_type))),
    severity = lower(btrim(coalesce(p_severity, severity))),
    note = btrim(coalesce(p_note, note)),
    happened_on = coalesce(p_happened_on, happened_on),
    updated_by = auth.uid(),
    updated_at = clock_timestamp()
  where id = p_note_id
  returning * into v_after;

  if v_after.note_type not in ('general','behavior','incident','training','health_context')
     or v_after.severity not in ('info','caution','high')
     or length(v_after.note) < 1
     or length(v_after.note) > 2000 then
    raise exception 'Datos de nota no válidos.' using errcode = '22023';
  end if;

  insert into public.admin_audit_logs (
    admin_user_id, action, entity_type, entity_id, details
  ) values (
    auth.uid(),
    'staff_dog_note.update',
    'dog',
    v_after.dog_id,
    jsonb_build_object('note_id', p_note_id, 'before', to_jsonb(v_before), 'after', to_jsonb(v_after))
  );

  return p_note_id;
end;
$$;

create or replace function public.staff_resolve_dog_note(
  p_note_id uuid,
  p_resolved boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dog_id uuid;
begin
  if not public.is_ucapsa_staff() then
    raise exception 'Solo staff UCAPSA puede cerrar notas internas.'
      using errcode = '42501';
  end if;

  update public.ucapsa_staff_dog_notes
  set
    resolved_at = case when coalesce(p_resolved, true) then clock_timestamp() else null end,
    resolved_by = case when coalesce(p_resolved, true) then auth.uid() else null end,
    updated_by = auth.uid(),
    updated_at = clock_timestamp()
  where id = p_note_id
  returning dog_id into v_dog_id;

  if v_dog_id is null then raise exception 'Nota no encontrada.' using errcode = '22023'; end if;

  insert into public.admin_audit_logs (
    admin_user_id, action, entity_type, entity_id, details
  ) values (
    auth.uid(),
    case when coalesce(p_resolved, true) then 'staff_dog_note.resolve' else 'staff_dog_note.reopen' end,
    'dog',
    v_dog_id,
    jsonb_build_object('note_id', p_note_id)
  );

  return p_note_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Resumen y roster por fecha. Se recalculan contra horario efectivo y
-- cancelaciones; no almacenan copias rígidas del horario.
-- ---------------------------------------------------------------------------

create or replace function public.get_staff_class_rsvp_summary(p_class_date date)
returns table (
  schedule_id uuid,
  program_code text,
  program_name text,
  program_level text,
  schedule_name text,
  start_time time,
  eligible_count integer,
  confirmed_count integer,
  declined_count integer,
  no_response_count integer
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_ucapsa_staff() then
    raise exception 'Solo staff UCAPSA puede consultar clases.'
      using errcode = '42501';
  end if;

  return query
  with eligible as (
    select
      e.id as enrollment_id,
      e.user_id,
      e.dog_id,
      e.schedule_id,
      p.code::text as program_code,
      p.name::text as program_name,
      e.program_level::text as program_level,
      effective.name::text as schedule_name,
      effective.start_time
    from public.program_enrollments e
    join public.programs p on p.id = e.program_id and p.is_active = true
    join lateral public.get_effective_program_schedule(e.schedule_id, p_class_date) effective on true
    where e.status = 'active'
      and effective.program_id = e.program_id
      and effective.is_active = true
      and extract(dow from p_class_date)::integer = effective.day_of_week
      and (
        effective.repeat_type <> 'biweekly'
        or (
          effective.cycle_start_date is not null
          and p_class_date >= effective.cycle_start_date
          and mod(((p_class_date - effective.cycle_start_date) / 7)::integer, 2) = 0
        )
      )
      and not exists (
        select 1
        from public.program_class_cancellations c
        where c.schedule_id = e.schedule_id
          and c.cancellation_date = p_class_date
          and c.restored_at is null
      )
      and (
        coalesce(e.access_mode, 'card') = 'membership'
        or (
          e.card_started_on is not null
          and e.card_expires_on is not null
          and p_class_date between e.card_started_on and e.card_expires_on
        )
      )
  )
  select
    x.schedule_id,
    x.program_code,
    x.program_name,
    x.program_level,
    x.schedule_name,
    x.start_time,
    count(*)::integer,
    count(*) filter (where r.response = 'yes')::integer,
    count(*) filter (where r.response = 'no')::integer,
    count(*) filter (where r.response is null)::integer
  from eligible x
  left join public.program_class_rsvps r
    on r.enrollment_id = x.enrollment_id
   and r.class_date = p_class_date
  group by
    x.schedule_id, x.program_code, x.program_name, x.program_level, x.schedule_name, x.start_time
  order by x.start_time, x.program_code, x.program_level;
end;
$$;

create or replace function public.get_staff_class_roster(p_class_date date)
returns table (
  schedule_id uuid,
  program_code text,
  program_name text,
  program_level text,
  schedule_name text,
  start_time time,
  enrollment_id uuid,
  user_id uuid,
  client_name text,
  dog_id uuid,
  dog_name text,
  rsvp_response text,
  attended boolean,
  safety_severity text,
  safety_note text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_ucapsa_staff() then
    raise exception 'Solo staff UCAPSA puede consultar el roster.'
      using errcode = '42501';
  end if;

  return query
  with eligible as (
    select
      e.id as enrollment_id,
      e.user_id,
      e.dog_id,
      coalesce(d.name, e.dog_name, 'Perro')::text as dog_name,
      e.schedule_id,
      p.code::text as program_code,
      p.name::text as program_name,
      e.program_level::text as program_level,
      effective.name::text as schedule_name,
      effective.start_time,
      coalesce(pr.full_name, pr.email, 'Cliente UCAPSA')::text as client_name
    from public.program_enrollments e
    join public.programs p on p.id = e.program_id and p.is_active = true
    join lateral public.get_effective_program_schedule(e.schedule_id, p_class_date) effective on true
    left join public.profiles pr on pr.user_id = e.user_id
    left join public.dogs d on d.id = e.dog_id
    where e.status = 'active'
      and effective.program_id = e.program_id
      and effective.is_active = true
      and extract(dow from p_class_date)::integer = effective.day_of_week
      and (
        effective.repeat_type <> 'biweekly'
        or (
          effective.cycle_start_date is not null
          and p_class_date >= effective.cycle_start_date
          and mod(((p_class_date - effective.cycle_start_date) / 7)::integer, 2) = 0
        )
      )
      and not exists (
        select 1 from public.program_class_cancellations c
        where c.schedule_id = e.schedule_id
          and c.cancellation_date = p_class_date
          and c.restored_at is null
      )
      and (
        coalesce(e.access_mode, 'card') = 'membership'
        or (
          e.card_started_on is not null
          and e.card_expires_on is not null
          and p_class_date between e.card_started_on and e.card_expires_on
        )
      )
  )
  select
    x.schedule_id,
    x.program_code,
    x.program_name,
    x.program_level,
    x.schedule_name,
    x.start_time,
    x.enrollment_id,
    x.user_id,
    x.client_name,
    x.dog_id,
    x.dog_name,
    r.response,
    exists (
      select 1 from public.program_attendances a
      where a.enrollment_id = x.enrollment_id
        and a.attendance_date = p_class_date
    ) as attended,
    safety.severity,
    safety.note
  from eligible x
  left join public.program_class_rsvps r
    on r.enrollment_id = x.enrollment_id
   and r.class_date = p_class_date
  left join lateral (
    select n.severity, n.note
    from public.ucapsa_staff_dog_notes n
    where n.dog_id = x.dog_id
      and n.resolved_at is null
      and n.severity in ('high','caution')
    order by
      case n.severity when 'high' then 0 else 1 end,
      n.happened_on desc,
      n.created_at desc
    limit 1
  ) safety on true
  order by x.start_time, x.program_code, x.program_level, x.dog_name;
end;
$$;

-- Registro manual de asistencia limitado a una clase real y elegible.
create or replace function public.staff_register_program_attendance(
  p_enrollment_id uuid,
  p_attendance_date date,
  p_schedule_id uuid,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_enrollment public.program_enrollments%rowtype;
  v_schedule record;
  v_session_id uuid;
  v_attendance_id uuid;
  v_today date := (clock_timestamp() at time zone 'America/Mexico_City')::date;
begin
  if not public.is_ucapsa_staff() then
    raise exception 'Solo staff UCAPSA puede registrar asistencia.'
      using errcode = '42501';
  end if;
  if p_attendance_date > v_today then
    raise exception 'No se puede registrar asistencia futura.' using errcode = '22023';
  end if;

  select * into v_enrollment
  from public.program_enrollments
  where id = p_enrollment_id
  for update;

  if not found or v_enrollment.status <> 'active' then
    raise exception 'Inscripción activa no encontrada.' using errcode = '22023';
  end if;
  if v_enrollment.schedule_id <> p_schedule_id then
    raise exception 'El horario no corresponde a esta inscripción.' using errcode = '22023';
  end if;

  select * into v_schedule
  from public.get_effective_program_schedule(p_schedule_id, p_attendance_date)
  where program_id = v_enrollment.program_id
    and is_active = true
  limit 1;

  if not found then
    raise exception 'No existe una clase activa para esa fecha.' using errcode = '22023';
  end if;
  if not public.program_schedule_occurs_on_date(p_schedule_id, p_attendance_date) then
    raise exception 'La fecha no corresponde al horario/ciclo.' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.program_class_cancellations c
    where c.schedule_id = p_schedule_id
      and c.cancellation_date = p_attendance_date
      and c.restored_at is null
  ) then
    raise exception 'La clase está cancelada.' using errcode = '22023';
  end if;
  if coalesce(v_enrollment.access_mode, 'card') <> 'membership'
     and (
       v_enrollment.card_started_on is null
       or v_enrollment.card_expires_on is null
       or p_attendance_date < v_enrollment.card_started_on
       or p_attendance_date > v_enrollment.card_expires_on
     ) then
    raise exception 'La tarjeta no está vigente para esa clase.' using errcode = '22023';
  end if;

  select a.id into v_attendance_id
  from public.program_attendances a
  where a.enrollment_id = p_enrollment_id
    and a.attendance_date = p_attendance_date
  limit 1;

  if v_attendance_id is not null then
    return v_attendance_id;
  end if;

  insert into public.program_sessions (
    schedule_id, session_date, scheduled_start_time, created_by
  ) values (
    p_schedule_id, p_attendance_date, v_schedule.start_time, auth.uid()
  )
  on conflict (schedule_id, session_date) do nothing
  returning id into v_session_id;

  if v_session_id is null then
    select id into v_session_id
    from public.program_sessions
    where schedule_id = p_schedule_id
      and session_date = p_attendance_date
    limit 1;
  end if;

  insert into public.program_attendances (
    enrollment_id,
    attendance_date,
    session_id,
    source,
    recorded_at,
    marked_by,
    notes,
    outside_window
  ) values (
    p_enrollment_id,
    p_attendance_date,
    v_session_id,
    'staff_manual',
    clock_timestamp(),
    auth.uid(),
    nullif(btrim(p_notes), ''),
    false
  )
  returning id into v_attendance_id;

  insert into public.admin_audit_logs (
    admin_user_id, action, entity_type, entity_id, details
  ) values (
    auth.uid(),
    'program_attendance.staff_register',
    'program_attendance',
    v_attendance_id,
    jsonb_build_object(
      'enrollment_id', p_enrollment_id,
      'attendance_date', p_attendance_date,
      'schedule_id', p_schedule_id
    )
  );

  return v_attendance_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Solicitud de socio: Entrenador puede enviar a revisión, nunca aprobar.
-- Reutiliza la cola existente memberships(status='pending').
-- ---------------------------------------------------------------------------

create or replace function public.staff_request_membership_review(
  p_user_id uuid,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing public.memberships%rowtype;
  v_id uuid;
begin
  if not public.is_ucapsa_staff() then
    raise exception 'Solo staff UCAPSA puede solicitar revisión de socio.'
      using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.program_enrollments e
    where e.user_id = p_user_id
      and e.status in ('active','completed')
  ) then
    raise exception 'El cliente no cumple el requisito mínimo de programa.'
      using errcode = '22023';
  end if;

  select * into v_existing
  from public.memberships m
  where m.user_id = p_user_id
  order by m.created_at desc
  limit 1;

  if found and v_existing.status in ('active','pending') then
    return v_existing.id;
  end if;

  insert into public.memberships (
    user_id, status, payment_notes
  ) values (
    p_user_id,
    'pending',
    nullif(btrim(p_note), '')
  )
  returning id into v_id;

  insert into public.admin_audit_logs (
    admin_user_id, action, entity_type, entity_id, details
  ) values (
    auth.uid(),
    'membership.staff_review_requested',
    'membership',
    v_id,
    jsonb_build_object('user_id', p_user_id, 'note', nullif(btrim(p_note), ''))
  );

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Reporte operativo exportable por rango. Máximo 366 días.
-- ---------------------------------------------------------------------------

create or replace function public.get_staff_training_report(
  p_start_date date,
  p_end_date date
)
returns table (
  class_date date,
  schedule_id uuid,
  program_code text,
  program_name text,
  program_level text,
  start_time time,
  enrollment_id uuid,
  user_id uuid,
  dog_id uuid,
  client_name text,
  dog_name text,
  rsvp_response text,
  attended boolean
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_ucapsa_staff() then
    raise exception 'Solo staff UCAPSA puede generar reportes operativos.'
      using errcode = '42501';
  end if;
  if p_start_date is null or p_end_date is null or p_end_date < p_start_date then
    raise exception 'Rango de fechas inválido.' using errcode = '22023';
  end if;
  if (p_end_date - p_start_date) > 365 then
    raise exception 'El reporte permite como máximo 366 días.' using errcode = '22023';
  end if;

  return query
  with dates as (
    select gs::date as class_date
    from generate_series(p_start_date::timestamp, p_end_date::timestamp, interval '1 day') gs
  ),
  eligible as (
    select
      dte.class_date,
      e.id as enrollment_id,
      e.schedule_id,
      p.code::text as program_code,
      p.name::text as program_name,
      e.program_level::text as program_level,
      effective.start_time,
      coalesce(pr.full_name, pr.email, 'Cliente UCAPSA')::text as client_name,
      coalesce(d.name, e.dog_name, 'Perro')::text as dog_name
    from dates dte
    join public.program_enrollments e
      on coalesce(e.started_at, e.created_at::date) <= dte.class_date
     and (e.completed_at is null or e.completed_at::date >= dte.class_date)
     and (e.cancelled_at is null or e.cancelled_at::date >= dte.class_date)
    join public.programs p on p.id = e.program_id
    join lateral public.get_effective_program_schedule(e.schedule_id, dte.class_date) effective on true
    left join public.profiles pr on pr.user_id = e.user_id
    left join public.dogs d on d.id = e.dog_id
    where effective.program_id = e.program_id
      and effective.is_active = true
      and extract(dow from dte.class_date)::integer = effective.day_of_week
      and (
        effective.repeat_type <> 'biweekly'
        or (
          effective.cycle_start_date is not null
          and dte.class_date >= effective.cycle_start_date
          and mod(((dte.class_date - effective.cycle_start_date) / 7)::integer, 2) = 0
        )
      )
      and not exists (
        select 1 from public.program_class_cancellations c
        where c.schedule_id = e.schedule_id
          and c.cancellation_date = dte.class_date
          and c.restored_at is null
      )
      and (
        coalesce(e.access_mode, 'card') = 'membership'
        or (
          e.card_started_on is not null
          and e.card_expires_on is not null
          and dte.class_date between e.card_started_on and e.card_expires_on
        )
      )
  )
  select
    x.class_date,
    x.schedule_id,
    x.program_code,
    x.program_name,
    x.program_level,
    x.start_time,
    x.enrollment_id,
    x.user_id,
    x.dog_id,
    x.client_name,
    x.dog_name,
    r.response,
    exists (
      select 1
      from public.program_attendances a
      where a.enrollment_id = x.enrollment_id
        and a.attendance_date = x.class_date
    ) as attended
  from eligible x
  left join public.program_class_rsvps r
    on r.enrollment_id = x.enrollment_id
   and r.class_date = x.class_date
  order by x.class_date, x.start_time, x.program_code, x.program_level, x.dog_name;
end;
$$;

-- ---------------------------------------------------------------------------
-- Exámenes: Entrenador captura; Admin conserva configuración y publicación.
-- ---------------------------------------------------------------------------

create or replace function public.get_trainer_exam_catalog()
returns table (
  exam_id uuid,
  exam_code text,
  exam_title text,
  exam_date date,
  season_id uuid,
  season_name text,
  season_status text,
  item_count integer,
  max_points numeric
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_ucapsa_staff() then
    raise exception 'Solo staff UCAPSA puede consultar exámenes.'
      using errcode = '42501';
  end if;

  return query
  select
    e.id,
    e.code,
    e.title,
    e.exam_date,
    e.season_id,
    s.name,
    s.status,
    count(i.id)::integer,
    coalesce(sum(i.max_points), 0)::numeric
  from public.ucapsa_exams e
  join public.ucapsa_competition_seasons s on s.id = e.season_id
  left join public.ucapsa_exam_items i on i.exam_id = e.id
  where e.status = 'published'
    and s.status <> 'closed'
  group by e.id, e.code, e.title, e.exam_date, e.season_id, s.name, s.status
  order by e.exam_date nulls last, e.sort_order, e.title;
end;
$$;

create or replace function public.get_trainer_exam_items(p_exam_id uuid)
returns table (
  id uuid,
  item_number integer,
  title text,
  description text,
  max_points numeric,
  sort_order integer
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_ucapsa_staff() then
    raise exception 'Solo staff UCAPSA puede consultar la estructura operativa del examen.'
      using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.ucapsa_exams e
    join public.ucapsa_competition_seasons s on s.id = e.season_id
    where e.id = p_exam_id
      and e.status = 'published'
      and s.status <> 'closed'
  ) then
    raise exception 'Examen publicado y activo no encontrado.'
      using errcode = '22023';
  end if;

  return query
  select i.id, i.item_number, i.title, i.description, i.max_points, i.sort_order
  from public.ucapsa_exam_items i
  where i.exam_id = p_exam_id
  order by i.sort_order, i.item_number;
end;
$$;

-- Importación operativa en bloque. El entrenador puede cargar calificaciones,
-- pero el resultado queda REVIEWED: publicación y oficialidad siguen siendo Admin.
create or replace function public.trainer_import_ucapsa_exam_results(
  p_exam_id uuid,
  p_file_name text,
  p_rows jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_exam public.ucapsa_exams%rowtype;
  v_batch_id uuid;
  v_row jsonb;
  v_row_number integer := 1;
  v_member_number text;
  v_dog_name text;
  v_user_id uuid;
  v_dog_id uuid;
  v_match_count integer;
  v_scores jsonb;
  v_item record;
  v_raw jsonb;
  v_score numeric;
  v_extra_key text;
  v_attempt_id uuid;
  v_rows_total integer;
begin
  if not public.is_ucapsa_staff() then
    raise exception 'Solo staff UCAPSA puede subir resultados de examen.'
      using errcode = '42501';
  end if;

  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'El archivo debe contener al menos una fila.'
      using errcode = '22023';
  end if;

  if jsonb_array_length(p_rows) > 500 then
    raise exception 'Un archivo puede contener como máximo 500 filas.'
      using errcode = '22023';
  end if;

  select * into v_exam
  from public.ucapsa_exams
  where id = p_exam_id
  for update;

  if not found then
    raise exception 'Examen no encontrado.' using errcode = '22023';
  end if;
  if v_exam.status <> 'published' then
    raise exception 'El examen debe estar publicado antes de subir calificaciones.'
      using errcode = '55000';
  end if;

  perform public.ucapsa_assert_competition_season_mutable(v_exam.season_id);

  if not exists (
    select 1 from public.ucapsa_exam_items i where i.exam_id = p_exam_id
  ) then
    raise exception 'El examen no tiene ejercicios configurados.'
      using errcode = '55000';
  end if;

  v_rows_total := jsonb_array_length(p_rows);

  insert into public.ucapsa_import_batches (
    season_id,
    exam_id,
    import_type,
    file_name,
    status,
    created_by,
    metadata
  ) values (
    v_exam.season_id,
    v_exam.id,
    'exam_results',
    nullif(btrim(p_file_name), ''),
    'draft',
    auth.uid(),
    jsonb_build_object(
      'source', 'trainer_upload',
      'rows_total', v_rows_total,
      'uploaded_at', clock_timestamp()
    )
  )
  returning id into v_batch_id;

  for v_row in
    select value from jsonb_array_elements(p_rows)
  loop
    v_member_number := nullif(btrim(v_row->>'member_number'), '');
    v_dog_name := nullif(btrim(v_row->>'dog_name'), '');
    v_scores := v_row->'scores';
    v_user_id := null;
    v_dog_id := null;

    if v_member_number is null then
      raise exception 'Fila %: falta Identificador.', v_row_number
        using errcode = '22023';
    end if;

    select m.user_id into v_user_id
    from public.memberships m
    where m.member_number = v_member_number
    order by case when m.status = 'active' then 0 else 1 end, m.created_at desc
    limit 1;

    if v_user_id is null then
      raise exception 'Fila %: no existe el Identificador %.', v_row_number, v_member_number
        using errcode = '22023';
    end if;

    if v_dog_name is null then
      raise exception 'Fila %: falta el nombre del perro.', v_row_number
        using errcode = '22023';
    end if;

    select count(*) into v_match_count
    from public.dogs d
    where d.user_id = v_user_id
      and d.is_active = true
      and lower(btrim(d.name)) = lower(v_dog_name);

    if v_match_count <> 1 then
      if v_match_count = 0 then
        raise exception 'Fila %: % no pertenece a esa cuenta.', v_row_number, v_dog_name
          using errcode = '22023';
      end if;
      raise exception 'Fila %: hay más de un perro llamado % en esa cuenta.', v_row_number, v_dog_name
        using errcode = '22023';
    end if;

    select d.id into v_dog_id
    from public.dogs d
    where d.user_id = v_user_id
      and d.is_active = true
      and lower(btrim(d.name)) = lower(v_dog_name)
    limit 1;

    if exists (
      select 1
      from public.ucapsa_exam_import_rows r
      where r.batch_id = v_batch_id
        and r.dog_id = v_dog_id
    ) then
      raise exception 'Fila %: el mismo perro aparece más de una vez en el archivo.', v_row_number
        using errcode = '22023';
    end if;

    if v_scores is null or jsonb_typeof(v_scores) <> 'object' then
      raise exception 'Fila %: faltan las calificaciones.', v_row_number
        using errcode = '22023';
    end if;

    for v_item in
      select i.id, i.item_number, i.title, i.max_points
      from public.ucapsa_exam_items i
      where i.exam_id = p_exam_id
      order by i.sort_order, i.item_number
    loop
      v_raw := v_scores -> v_item.item_number::text;

      if v_raw is null then
        raise exception 'Fila %: falta calificación para %.', v_row_number, v_item.title
          using errcode = '22023';
      end if;
      if jsonb_typeof(v_raw) <> 'number' then
        raise exception 'Fila %: la calificación de % debe ser numérica.', v_row_number, v_item.title
          using errcode = '22023';
      end if;

      v_score := (v_raw #>> '{}')::numeric;
      if v_score < 0 or v_score > v_item.max_points then
        raise exception 'Fila %: % debe estar entre 0 y %.', v_row_number, v_item.title, v_item.max_points
          using errcode = '22023';
      end if;
    end loop;

    for v_extra_key in select jsonb_object_keys(v_scores)
    loop
      if not exists (
        select 1
        from public.ucapsa_exam_items i
        where i.exam_id = p_exam_id
          and i.item_number::text = v_extra_key
      ) then
        raise exception 'Fila %: la columna % no pertenece al examen.', v_row_number, v_extra_key
          using errcode = '22023';
      end if;
    end loop;

    v_attempt_id := public.trainer_create_ucapsa_exam_attempt(
      p_exam_id,
      v_dog_id,
      coalesce(v_exam.exam_date::timestamp at time zone 'America/Mexico_City', clock_timestamp())
    );

    update public.ucapsa_exam_attempts
    set import_batch_id = v_batch_id
    where id = v_attempt_id;

    for v_item in
      select i.id, i.item_number
      from public.ucapsa_exam_items i
      where i.exam_id = p_exam_id
      order by i.sort_order, i.item_number
    loop
      perform public.trainer_upsert_ucapsa_exam_item_result(
        v_attempt_id,
        v_item.id,
        (v_scores->>v_item.item_number::text)::numeric,
        null
      );
    end loop;

    perform public.trainer_review_ucapsa_exam_attempt(v_attempt_id);

    insert into public.ucapsa_exam_import_rows (
      batch_id,
      row_number,
      member_number,
      dog_name,
      dog_id,
      raw_data,
      scores,
      validation_status,
      validation_errors,
      attempt_id
    ) values (
      v_batch_id,
      v_row_number + 1,
      v_member_number,
      v_dog_name,
      v_dog_id,
      v_row,
      v_scores,
      'valid',
      '[]'::jsonb,
      v_attempt_id
    );

    v_row_number := v_row_number + 1;
  end loop;

  update public.ucapsa_import_batches
  set
    status = 'committed',
    committed_at = clock_timestamp(),
    updated_at = clock_timestamp(),
    metadata = metadata || jsonb_build_object(
      'rows_valid', v_rows_total,
      'rows_invalid', 0,
      'attempts_reviewed', v_rows_total,
      'committed_at', clock_timestamp()
    )
  where id = v_batch_id;

  insert into public.admin_audit_logs (
    admin_user_id, action, entity_type, entity_id, details
  ) values (
    auth.uid(),
    'ucapsa_exam_import.staff_upload',
    'ucapsa_import_batch',
    v_batch_id,
    jsonb_build_object(
      'exam_id', p_exam_id,
      'file_name', nullif(btrim(p_file_name), ''),
      'rows', v_rows_total,
      'result', 'reviewed_pending_admin_publish'
    )
  );

  return jsonb_build_object(
    'batch_id', v_batch_id,
    'rows_imported', v_rows_total,
    'attempts_reviewed', v_rows_total,
    'status', 'reviewed_pending_admin_publish'
  );
end;
$$;

create or replace function public.get_trainer_exam_dogs()
returns table (
  dog_id uuid,
  dog_name text,
  owner_name text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_ucapsa_staff() then
    raise exception 'Solo staff UCAPSA puede consultar perros de examen.'
      using errcode = '42501';
  end if;

  return query
  select
    d.id,
    d.name,
    coalesce(p.full_name, p.email, 'Cliente UCAPSA')::text
  from public.dogs d
  left join public.profiles p on p.user_id = d.user_id
  where d.is_active = true
  order by d.name, owner_name;
end;
$$;

create or replace function public.trainer_create_ucapsa_exam_attempt(
  p_exam_id uuid,
  p_dog_id uuid,
  p_presented_at timestamptz default now()
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_exam public.ucapsa_exams%rowtype;
  v_id uuid;
  v_attempt_number integer;
begin
  if not public.is_ucapsa_staff() then
    raise exception 'Solo staff UCAPSA puede capturar intentos.'
      using errcode = '42501';
  end if;
  if p_presented_at is null then raise exception 'presented_at es obligatorio.'; end if;
  if not exists (select 1 from public.dogs d where d.id = p_dog_id and d.is_active = true) then
    raise exception 'Perro no encontrado.' using errcode = '22023';
  end if;

  select * into v_exam
  from public.ucapsa_exams
  where id = p_exam_id
  for update;

  if not found then raise exception 'Examen UCAPSA no encontrado.'; end if;
  if v_exam.status <> 'published' then
    raise exception 'Sólo se capturan resultados sobre un examen publicado.';
  end if;
  perform public.ucapsa_assert_competition_season_mutable(v_exam.season_id);

  select coalesce(max(a.attempt_number), 0) + 1
    into v_attempt_number
  from public.ucapsa_exam_attempts a
  where a.exam_id = p_exam_id
    and a.dog_id = p_dog_id;

  insert into public.ucapsa_exam_attempts (
    exam_id, dog_id, attempt_number, status, is_official, presented_at, created_by
  ) values (
    p_exam_id, p_dog_id, v_attempt_number, 'draft', false, p_presented_at, auth.uid()
  )
  returning id into v_id;

  insert into public.admin_audit_logs (
    admin_user_id, action, entity_type, entity_id, details
  ) values (
    auth.uid(),
    'ucapsa_exam_attempt.staff_create',
    'ucapsa_exam_attempt',
    v_id,
    jsonb_build_object('exam_id', p_exam_id, 'dog_id', p_dog_id, 'attempt_number', v_attempt_number)
  );

  return v_id;
end;
$$;

create or replace function public.get_trainer_exam_attempt(p_attempt_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payload jsonb;
begin
  if not public.is_ucapsa_staff() then
    raise exception 'Solo staff UCAPSA puede consultar intentos.'
      using errcode = '42501';
  end if;

  select jsonb_build_object(
    'attempt', to_jsonb(a),
    'exam', to_jsonb(e),
    'dog', jsonb_build_object(
      'id', d.id,
      'name', d.name,
      'owner_name', coalesce(p.full_name, p.email, 'Cliente UCAPSA')
    ),
    'items', coalesce((
      select jsonb_agg(to_jsonb(i) order by i.sort_order, i.item_number)
      from public.ucapsa_exam_items i
      where i.exam_id = e.id
    ), '[]'::jsonb),
    'results', coalesce((
      select jsonb_agg(to_jsonb(r) order by r.exam_item_id)
      from public.ucapsa_exam_item_results r
      where r.attempt_id = a.id
    ), '[]'::jsonb)
  )
  into v_payload
  from public.ucapsa_exam_attempts a
  join public.ucapsa_exams e on e.id = a.exam_id
  join public.dogs d on d.id = a.dog_id
  left join public.profiles p on p.user_id = d.user_id
  where a.id = p_attempt_id;

  if v_payload is null then raise exception 'Intento no encontrado.' using errcode = '22023'; end if;
  return v_payload;
end;
$$;

create or replace function public.trainer_upsert_ucapsa_exam_item_result(
  p_attempt_id uuid,
  p_exam_item_id uuid,
  p_points_awarded numeric,
  p_evaluator_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_attempt public.ucapsa_exam_attempts%rowtype;
  v_item public.ucapsa_exam_items%rowtype;
begin
  if not public.is_ucapsa_staff() then
    raise exception 'Solo staff UCAPSA puede capturar resultados.'
      using errcode = '42501';
  end if;
  if p_points_awarded is null or p_points_awarded < 0 then
    raise exception 'La puntuación debe ser cero o mayor.';
  end if;

  select * into v_attempt
  from public.ucapsa_exam_attempts
  where id = p_attempt_id
  for update;
  if not found then raise exception 'Intento no encontrado.'; end if;
  if v_attempt.status <> 'draft' then
    raise exception 'El entrenador sólo puede editar intentos en borrador.';
  end if;

  select * into v_item
  from public.ucapsa_exam_items
  where id = p_exam_item_id
    and exam_id = v_attempt.exam_id;
  if not found then raise exception 'Ejercicio no encontrado para este examen.'; end if;
  if p_points_awarded > v_item.max_points then
    raise exception 'La puntuación supera el máximo del ejercicio.';
  end if;

  perform public.ucapsa_assert_exam_mutable(v_attempt.exam_id);

  insert into public.ucapsa_exam_item_results (
    attempt_id, exam_item_id, points_awarded, evaluator_note, updated_by
  ) values (
    p_attempt_id,
    p_exam_item_id,
    p_points_awarded,
    nullif(btrim(p_evaluator_note), ''),
    auth.uid()
  )
  on conflict (attempt_id, exam_item_id) do update
  set
    points_awarded = excluded.points_awarded,
    evaluator_note = excluded.evaluator_note,
    updated_by = auth.uid(),
    updated_at = clock_timestamp();

  insert into public.admin_audit_logs (
    admin_user_id, action, entity_type, entity_id, details
  ) values (
    auth.uid(),
    'ucapsa_exam_result.staff_upsert',
    'ucapsa_exam_attempt',
    p_attempt_id,
    jsonb_build_object('exam_item_id', p_exam_item_id, 'points_awarded', p_points_awarded)
  );

  return p_attempt_id;
end;
$$;

create or replace function public.trainer_review_ucapsa_exam_attempt(p_attempt_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_attempt public.ucapsa_exam_attempts%rowtype;
  v_expected integer;
  v_actual integer;
begin
  if not public.is_ucapsa_staff() then
    raise exception 'Solo staff UCAPSA puede enviar intentos a revisión.'
      using errcode = '42501';
  end if;

  select * into v_attempt
  from public.ucapsa_exam_attempts
  where id = p_attempt_id
  for update;

  if not found then raise exception 'Intento no encontrado.'; end if;
  if v_attempt.status <> 'draft' then
    raise exception 'Sólo un intento en borrador puede enviarse a revisión.';
  end if;

  select count(*) into v_expected
  from public.ucapsa_exam_items
  where exam_id = v_attempt.exam_id;

  select count(*) into v_actual
  from public.ucapsa_exam_item_results
  where attempt_id = p_attempt_id;

  if v_expected = 0 or v_actual <> v_expected then
    raise exception 'Faltan ejercicios por calificar.';
  end if;

  update public.ucapsa_exam_attempts
  set status = 'reviewed',
      reviewed_at = clock_timestamp(),
      reviewed_by = auth.uid(),
      updated_at = clock_timestamp()
  where id = p_attempt_id;

  insert into public.admin_audit_logs (
    admin_user_id, action, entity_type, entity_id, details
  ) values (
    auth.uid(),
    'ucapsa_exam_attempt.staff_review',
    'ucapsa_exam_attempt',
    p_attempt_id,
    '{}'::jsonb
  );

  return p_attempt_id;
end;
$$;

-- RPC grants: all authorization is inside each SECURITY DEFINER function.
revoke all on function public.get_staff_dog_notes(uuid) from public, anon;
revoke all on function public.staff_add_dog_note(uuid,text,text,text,date) from public, anon;
revoke all on function public.staff_update_dog_note(uuid,text,text,text,date) from public, anon;
revoke all on function public.staff_resolve_dog_note(uuid,boolean) from public, anon;
revoke all on function public.get_staff_class_rsvp_summary(date) from public, anon;
revoke all on function public.get_staff_class_roster(date) from public, anon;
revoke all on function public.staff_register_program_attendance(uuid,date,uuid,text) from public, anon;
revoke all on function public.staff_request_membership_review(uuid,text) from public, anon;
revoke all on function public.get_staff_training_report(date,date) from public, anon;
revoke all on function public.get_trainer_exam_catalog() from public, anon;
revoke all on function public.get_trainer_exam_items(uuid) from public, anon;
revoke all on function public.trainer_import_ucapsa_exam_results(uuid,text,jsonb) from public, anon;
revoke all on function public.get_trainer_exam_dogs() from public, anon;
revoke all on function public.trainer_create_ucapsa_exam_attempt(uuid,uuid,timestamptz) from public, anon;
revoke all on function public.get_trainer_exam_attempt(uuid) from public, anon;
revoke all on function public.trainer_upsert_ucapsa_exam_item_result(uuid,uuid,numeric,text) from public, anon;
revoke all on function public.trainer_review_ucapsa_exam_attempt(uuid) from public, anon;

grant execute on function public.get_staff_dog_notes(uuid) to authenticated, service_role;
grant execute on function public.staff_add_dog_note(uuid,text,text,text,date) to authenticated, service_role;
grant execute on function public.staff_update_dog_note(uuid,text,text,text,date) to authenticated, service_role;
grant execute on function public.staff_resolve_dog_note(uuid,boolean) to authenticated, service_role;
grant execute on function public.get_staff_class_rsvp_summary(date) to authenticated, service_role;
grant execute on function public.get_staff_class_roster(date) to authenticated, service_role;
grant execute on function public.staff_register_program_attendance(uuid,date,uuid,text) to authenticated, service_role;
grant execute on function public.staff_request_membership_review(uuid,text) to authenticated, service_role;
grant execute on function public.get_staff_training_report(date,date) to authenticated, service_role;
grant execute on function public.get_trainer_exam_catalog() to authenticated, service_role;
grant execute on function public.get_trainer_exam_items(uuid) to authenticated, service_role;
grant execute on function public.trainer_import_ucapsa_exam_results(uuid,text,jsonb) to authenticated, service_role;
grant execute on function public.get_trainer_exam_dogs() to authenticated, service_role;
grant execute on function public.trainer_create_ucapsa_exam_attempt(uuid,uuid,timestamptz) to authenticated, service_role;
grant execute on function public.get_trainer_exam_attempt(uuid) to authenticated, service_role;
grant execute on function public.trainer_upsert_ucapsa_exam_item_result(uuid,uuid,numeric,text) to authenticated, service_role;
grant execute on function public.trainer_review_ucapsa_exam_attempt(uuid) to authenticated, service_role;

commit;
