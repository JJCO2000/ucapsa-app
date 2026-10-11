-- UCAPSA — rol operativo Entrenador
--
-- Principio: mínimo privilegio. Entrenador ve y captura sólo información
-- necesaria para operar entrenamiento: clases esperadas, roster, perros,
-- notas operativas y captura/revisión de exámenes. No recibe permisos de
-- pagos, banca, membresías, comunicaciones, temporadas, ranking ni publicación.
--
-- Esta migración es aditiva. No reemplaza admin/super_admin.


create or replace function public.is_ucapsa_trainer()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select p.role::text = 'trainer'
    from public.profiles p
    where p.user_id = auth.uid()
    limit 1
  ), false);
$$;

revoke all on function public.is_ucapsa_trainer() from public, anon;
grant execute on function public.is_ucapsa_trainer() to authenticated, service_role;

create or replace function public.is_ucapsa_training_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select p.role::text in ('trainer', 'admin', 'super_admin')
    from public.profiles p
    where p.user_id = auth.uid()
    limit 1
  ), false);
$$;

revoke all on function public.is_ucapsa_training_staff() from public, anon;
grant execute on function public.is_ucapsa_training_staff() to authenticated, service_role;

create or replace function public.superadmin_set_trainer_role(
  p_user_id uuid,
  p_enabled boolean
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_next text;
begin
  if not public.is_super_admin() then
    raise exception 'Solo Superadmin puede asignar el rol Entrenador.'
      using errcode = '42501';
  end if;

  select p.role::text
    into v_role
  from public.profiles p
  where p.user_id = p_user_id
  for update;

  if not found then
    raise exception 'Perfil no encontrado.'
      using errcode = '22023';
  end if;

  if coalesce(p_enabled, false) then
    if v_role not in ('client', 'trainer') then
      raise exception 'Entrenador usa una cuenta de staff separada; no se convierte una cuenta de socio o administrador.'
        using errcode = '22023';
    end if;
    v_next := 'trainer';
  else
    if v_role <> 'trainer' then
      raise exception 'La cuenta seleccionada no es Entrenador.'
        using errcode = '22023';
    end if;
    v_next := 'client';
  end if;

  update public.profiles
  set role = v_next::public.app_role,
      updated_at = clock_timestamp()
  where user_id = p_user_id;

  insert into public.admin_audit_logs (
    admin_user_id, action, entity_type, entity_id, details
  ) values (
    auth.uid(),
    'staff.trainer_role',
    'profile',
    p_user_id,
    jsonb_build_object('before_role', v_role, 'after_role', v_next)
  );

  return v_next;
end;
$$;

revoke all on function public.superadmin_set_trainer_role(uuid,boolean)
  from public, anon;
grant execute on function public.superadmin_set_trainer_role(uuid,boolean)
  to authenticated, service_role;

-- Historial operativo por perro. Se conserva como eventos; no se sobreescribe
-- behavior_notes para no perder "qué pasó" ni cuándo ocurrió.
create table if not exists public.dog_staff_notes (
  id uuid primary key default gen_random_uuid(),
  dog_id uuid not null references public.dogs(id) on delete cascade,
  note_type text not null default 'general'
    check (note_type in ('general', 'training', 'behavior', 'interaction', 'safety')),
  severity text not null default 'info'
    check (severity in ('info', 'watch', 'high')),
  note text not null check (btrim(note) <> ''),
  occurred_at timestamptz not null default clock_timestamp(),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default clock_timestamp()
);

create index if not exists dog_staff_notes_dog_occurred_idx
  on public.dog_staff_notes (dog_id, occurred_at desc, created_at desc);

alter table public.dog_staff_notes enable row level security;
revoke all on table public.dog_staff_notes from public, anon, authenticated;
grant select, insert on table public.dog_staff_notes to service_role;

create or replace function public.staff_add_dog_note(
  p_dog_id uuid,
  p_note text,
  p_note_type text default 'general',
  p_severity text default 'info',
  p_occurred_at timestamptz default clock_timestamp()
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_type text := lower(btrim(coalesce(p_note_type, 'general')));
  v_severity text := lower(btrim(coalesce(p_severity, 'info')));
begin
  if not public.is_ucapsa_training_staff() then
    raise exception 'Solo staff de entrenamiento puede registrar notas operativas.'
      using errcode = '42501';
  end if;
  if v_note is null then raise exception 'La nota no puede estar vacía.' using errcode = '22023'; end if;
  if v_type not in ('general', 'training', 'behavior', 'interaction', 'safety') then
    raise exception 'Tipo de nota no válido.' using errcode = '22023';
  end if;
  if v_severity not in ('info', 'watch', 'high') then
    raise exception 'Prioridad de nota no válida.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.dogs d where d.id = p_dog_id) then
    raise exception 'Perro no encontrado.' using errcode = '22023';
  end if;

  insert into public.dog_staff_notes (
    dog_id, note_type, severity, note, occurred_at, created_by
  ) values (
    p_dog_id, v_type, v_severity, v_note, coalesce(p_occurred_at, clock_timestamp()), auth.uid()
  )
  returning id into v_id;

  insert into public.admin_audit_logs (
    admin_user_id, action, entity_type, entity_id, details
  ) values (
    auth.uid(), 'dog.staff_note.add', 'dog', p_dog_id,
    jsonb_build_object('note_id', v_id, 'note_type', v_type, 'severity', v_severity)
  );

  return v_id;
end;
$$;

revoke all on function public.staff_add_dog_note(uuid,text,text,text,timestamptz)
  from public, anon;
grant execute on function public.staff_add_dog_note(uuid,text,text,text,timestamptz)
  to authenticated, service_role;

create or replace function public.get_staff_dog_notes(
  p_dog_id uuid,
  p_limit integer default 50
)
returns table (
  id uuid,
  dog_id uuid,
  note_type text,
  severity text,
  note text,
  occurred_at timestamptz,
  created_at timestamptz,
  created_by uuid,
  created_by_name text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_ucapsa_training_staff() then
    raise exception 'Solo staff de entrenamiento puede consultar notas operativas.'
      using errcode = '42501';
  end if;

  return query
  select
    n.id,
    n.dog_id,
    n.note_type,
    n.severity,
    n.note,
    n.occurred_at,
    n.created_at,
    n.created_by,
    coalesce(p.full_name, p.email, 'Staff UCAPSA')::text
  from public.dog_staff_notes n
  left join public.profiles p on p.user_id = n.created_by
  where n.dog_id = p_dog_id
  order by n.occurred_at desc, n.created_at desc
  limit greatest(1, least(coalesce(p_limit, 50), 200));
end;
$$;

revoke all on function public.get_staff_dog_notes(uuid,integer)
  from public, anon;
grant execute on function public.get_staff_dog_notes(uuid,integer)
  to authenticated, service_role;

create or replace function public.get_staff_dog_directory(
  p_query text default null
)
returns table (
  dog_id uuid,
  dog_name text,
  owner_name text,
  program_code text,
  program_level text,
  membership_status text,
  behavior_notes text,
  latest_staff_note text,
  latest_note_type text,
  latest_note_severity text,
  latest_note_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_query text := lower(btrim(coalesce(p_query, '')));
begin
  if not public.is_ucapsa_training_staff() then
    raise exception 'Solo staff de entrenamiento puede consultar perros.'
      using errcode = '42501';
  end if;

  return query
  select
    d.id,
    d.name::text,
    coalesce(p.full_name, p.email, 'Cliente UCAPSA')::text,
    e.program_code,
    e.program_level,
    coalesce(m.status::text, 'none'),
    d.behavior_notes,
    note.note,
    note.note_type,
    note.severity,
    note.occurred_at
  from public.dogs d
  left join public.profiles p on p.user_id = d.user_id
  left join lateral (
    select pr.code::text as program_code, pe.program_level::text as program_level
    from public.program_enrollments pe
    join public.programs pr on pr.id = pe.program_id
    where pe.dog_id = d.id
      and pe.status = 'active'
    order by case when pr.code = 'comandos' then 0 else 1 end, pe.created_at desc
    limit 1
  ) e on true
  left join lateral (
    select ms.status
    from public.memberships ms
    where ms.user_id = d.user_id
    order by ms.created_at desc
    limit 1
  ) m on true
  left join lateral (
    select n.note, n.note_type, n.severity, n.occurred_at
    from public.dog_staff_notes n
    where n.dog_id = d.id
    order by n.occurred_at desc, n.created_at desc
    limit 1
  ) note on true
  where d.is_active = true
    and (
      v_query = ''
      or lower(d.name) like '%' || v_query || '%'
      or lower(coalesce(p.full_name, '')) like '%' || v_query || '%'
      or lower(coalesce(p.email, '')) like '%' || v_query || '%'
    )
  order by d.name asc
  limit 250;
end;
$$;

revoke all on function public.get_staff_dog_directory(text)
  from public, anon;
grant execute on function public.get_staff_dog_directory(text)
  to authenticated, service_role;

-- Aforo esperado: Comandos comparte horario, pero se agrupa además por nivel.
create or replace function public.get_staff_class_rsvp_summary(
  p_class_date date
)
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
  if not public.is_ucapsa_training_staff() then
    raise exception 'Solo staff de entrenamiento puede consultar aforo esperado.'
      using errcode = '42501';
  end if;

  return query
  with eligible as (
    select
      e.id as enrollment_id,
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
    count(*)::integer,
    count(*) filter (where r.response = 'yes')::integer,
    count(*) filter (where r.response = 'no')::integer,
    count(*) filter (where r.response is null)::integer
  from eligible x
  left join public.program_class_rsvps r
    on r.enrollment_id = x.enrollment_id
   and r.class_date = p_class_date
  group by
    x.schedule_id, x.program_code, x.program_name, x.program_level,
    x.schedule_name, x.start_time
  order by
    x.start_time,
    case x.program_code when 'puppy' then 0 else 1 end,
    case x.program_level
      when 'principiante' then 1
      when 'medio' then 2
      when 'avanzado' then 3
      else 0
    end;
end;
$$;

revoke all on function public.get_staff_class_rsvp_summary(date)
  from public, anon;
grant execute on function public.get_staff_class_rsvp_summary(date)
  to authenticated, service_role;

create or replace function public.get_staff_class_roster(
  p_class_date date
)
returns table (
  enrollment_id uuid,
  dog_id uuid,
  dog_name text,
  owner_name text,
  program_code text,
  program_level text,
  schedule_id uuid,
  schedule_name text,
  start_time time,
  rsvp_response text,
  membership_status text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_ucapsa_training_staff() then
    raise exception 'Solo staff de entrenamiento puede consultar el roster.'
      using errcode = '42501';
  end if;

  return query
  select
    e.id,
    e.dog_id,
    coalesce(d.name, e.dog_name, 'Perro')::text,
    coalesce(profile.full_name, profile.email, 'Cliente UCAPSA')::text,
    p.code::text,
    e.program_level::text,
    e.schedule_id,
    effective.name::text,
    effective.start_time,
    r.response,
    coalesce(m.status::text, 'none')
  from public.program_enrollments e
  join public.programs p on p.id = e.program_id and p.is_active = true
  join lateral public.get_effective_program_schedule(e.schedule_id, p_class_date) effective on true
  left join public.dogs d on d.id = e.dog_id
  left join public.profiles profile on profile.user_id = e.user_id
  left join public.program_class_rsvps r
    on r.enrollment_id = e.id
   and r.class_date = p_class_date
  left join lateral (
    select ms.status
    from public.memberships ms
    where ms.user_id = e.user_id
    order by ms.created_at desc
    limit 1
  ) m on true
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
  order by effective.start_time,
    case p.code when 'puppy' then 0 else 1 end,
    case e.program_level
      when 'principiante' then 1
      when 'medio' then 2
      when 'avanzado' then 3
      else 0
    end,
    coalesce(d.name, e.dog_name, 'Perro');
end;
$$;

revoke all on function public.get_staff_class_roster(date)
  from public, anon;
grant execute on function public.get_staff_class_roster(date)
  to authenticated, service_role;

create or replace function public.get_staff_class_report(
  p_from_date date,
  p_to_date date
)
returns table (
  class_date date,
  schedule_id uuid,
  program_code text,
  program_level text,
  start_time time,
  eligible_count integer,
  confirmed_count integer,
  declined_count integer,
  no_response_count integer,
  attendance_count integer
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_ucapsa_training_staff() then
    raise exception 'Solo staff de entrenamiento puede generar reportes operativos.'
      using errcode = '42501';
  end if;
  if p_from_date is null or p_to_date is null or p_to_date < p_from_date then
    raise exception 'Rango de fechas inválido.' using errcode = '22023';
  end if;
  if p_to_date - p_from_date > 366 then
    raise exception 'El reporte admite hasta 367 días por consulta.' using errcode = '22023';
  end if;

  return query
  with dates as (
    select gs::date as class_date
    from generate_series(p_from_date, p_to_date, interval '1 day') gs
  ),
  eligible as (
    select
      dt.class_date,
      e.id as enrollment_id,
      e.schedule_id,
      p.code::text as program_code,
      e.program_level::text as program_level,
      effective.start_time
    from dates dt
    join public.program_enrollments e on e.status = 'active'
    join public.programs p on p.id = e.program_id and p.is_active = true
    join lateral public.get_effective_program_schedule(e.schedule_id, dt.class_date) effective on true
    where effective.program_id = e.program_id
      and effective.is_active = true
      and extract(dow from dt.class_date)::integer = effective.day_of_week
      and (
        effective.repeat_type <> 'biweekly'
        or (
          effective.cycle_start_date is not null
          and dt.class_date >= effective.cycle_start_date
          and mod(((dt.class_date - effective.cycle_start_date) / 7)::integer, 2) = 0
        )
      )
      and not exists (
        select 1 from public.program_class_cancellations c
        where c.schedule_id = e.schedule_id
          and c.cancellation_date = dt.class_date
          and c.restored_at is null
      )
      and (
        coalesce(e.access_mode, 'card') = 'membership'
        or (
          e.card_started_on is not null
          and e.card_expires_on is not null
          and dt.class_date between e.card_started_on and e.card_expires_on
        )
      )
  )
  select
    x.class_date,
    x.schedule_id,
    x.program_code,
    x.program_level,
    x.start_time,
    count(*)::integer,
    count(*) filter (where r.response = 'yes')::integer,
    count(*) filter (where r.response = 'no')::integer,
    count(*) filter (where r.response is null)::integer,
    count(*) filter (where a.id is not null)::integer
  from eligible x
  left join public.program_class_rsvps r
    on r.enrollment_id = x.enrollment_id
   and r.class_date = x.class_date
  left join public.program_attendances a
    on a.enrollment_id = x.enrollment_id
   and a.attendance_date = x.class_date
  group by
    x.class_date, x.schedule_id, x.program_code, x.program_level, x.start_time
  order by
    x.class_date, x.start_time,
    case x.program_code when 'puppy' then 0 else 1 end,
    case x.program_level
      when 'principiante' then 1
      when 'medio' then 2
      when 'avanzado' then 3
      else 0
    end;
end;
$$;

revoke all on function public.get_staff_class_report(date,date)
  from public, anon;
grant execute on function public.get_staff_class_report(date,date)
  to authenticated, service_role;

-- Exámenes: el entrenador captura y revisa. No puede configurar/publish/official/void.
create or replace function public.get_staff_published_exams()
returns table (
  exam_id uuid,
  exam_code text,
  exam_title text,
  exam_date date,
  season_name text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_ucapsa_training_staff() then
    raise exception 'Solo staff de entrenamiento puede consultar exámenes.'
      using errcode = '42501';
  end if;

  return query
  select e.id, e.code::text, e.title::text, e.exam_date, s.name::text
  from public.ucapsa_exams e
  join public.ucapsa_competition_seasons s on s.id = e.season_id
  where e.status = 'published'
    and s.status in ('active', 'reopened')
  order by coalesce(e.exam_date, current_date), e.sort_order, e.title;
end;
$$;

revoke all on function public.get_staff_published_exams() from public, anon;
grant execute on function public.get_staff_published_exams() to authenticated, service_role;

create or replace function public.get_staff_exam_items(p_exam_id uuid)
returns table (
  exam_item_id uuid,
  item_number integer,
  title text,
  description text,
  max_points numeric
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_ucapsa_training_staff() then
    raise exception 'Solo staff de entrenamiento puede consultar ejercicios.'
      using errcode = '42501';
  end if;

  return query
  select i.id, i.item_number, i.title::text, i.description, i.max_points
  from public.ucapsa_exam_items i
  join public.ucapsa_exams e on e.id = i.exam_id
  where i.exam_id = p_exam_id
    and e.status = 'published'
  order by i.sort_order, i.item_number;
end;
$$;

revoke all on function public.get_staff_exam_items(uuid) from public, anon;
grant execute on function public.get_staff_exam_items(uuid) to authenticated, service_role;

create or replace function public.get_staff_exam_attempts(p_limit integer default 50)
returns table (
  attempt_id uuid,
  exam_id uuid,
  exam_title text,
  dog_id uuid,
  dog_name text,
  owner_name text,
  attempt_status text,
  attempt_number integer,
  presented_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_ucapsa_training_staff() then
    raise exception 'Solo staff de entrenamiento puede consultar intentos.'
      using errcode = '42501';
  end if;

  return query
  select
    a.id, a.exam_id, e.title::text, a.dog_id, d.name::text,
    coalesce(p.full_name, p.email, 'Cliente UCAPSA')::text,
    a.status::text, a.attempt_number, a.presented_at
  from public.ucapsa_exam_attempts a
  join public.ucapsa_exams e on e.id = a.exam_id
  join public.dogs d on d.id = a.dog_id
  left join public.profiles p on p.user_id = d.user_id
  where e.status = 'published'
    and a.status in ('draft', 'reviewed')
  order by a.presented_at desc
  limit greatest(1, least(coalesce(p_limit, 50), 200));
end;
$$;

revoke all on function public.get_staff_exam_attempts(integer) from public, anon;
grant execute on function public.get_staff_exam_attempts(integer) to authenticated, service_role;

create or replace function public.get_staff_exam_attempt_detail(p_attempt_id uuid)
returns table (
  attempt_id uuid,
  exam_id uuid,
  exam_title text,
  dog_id uuid,
  dog_name text,
  owner_name text,
  attempt_status text,
  exam_item_id uuid,
  item_number integer,
  item_title text,
  item_description text,
  max_points numeric,
  points_awarded numeric,
  evaluator_note text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_ucapsa_training_staff() then
    raise exception 'Solo staff de entrenamiento puede consultar el intento.'
      using errcode = '42501';
  end if;

  return query
  select
    a.id, a.exam_id, e.title::text, a.dog_id, d.name::text,
    coalesce(p.full_name, p.email, 'Cliente UCAPSA')::text,
    a.status::text,
    i.id, i.item_number, i.title::text, i.description, i.max_points,
    r.points_awarded, r.evaluator_note
  from public.ucapsa_exam_attempts a
  join public.ucapsa_exams e on e.id = a.exam_id
  join public.dogs d on d.id = a.dog_id
  left join public.profiles p on p.user_id = d.user_id
  join public.ucapsa_exam_items i on i.exam_id = a.exam_id
  left join public.ucapsa_exam_item_results r
    on r.attempt_id = a.id
   and r.exam_item_id = i.id
  where a.id = p_attempt_id
    and e.status = 'published'
    and a.status in ('draft', 'reviewed')
  order by i.sort_order, i.item_number;
end;
$$;

revoke all on function public.get_staff_exam_attempt_detail(uuid) from public, anon;
grant execute on function public.get_staff_exam_attempt_detail(uuid) to authenticated, service_role;

create or replace function public.trainer_create_ucapsa_exam_attempt(
  p_exam_id uuid,
  p_dog_id uuid,
  p_presented_at timestamptz default clock_timestamp()
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
  if not public.is_ucapsa_training_staff() then
    raise exception 'Solo staff de entrenamiento puede iniciar intentos.'
      using errcode = '42501';
  end if;
  if p_presented_at is null then raise exception 'presented_at es obligatorio.'; end if;
  if not exists (select 1 from public.dogs d where d.id = p_dog_id and d.is_active = true) then
    raise exception 'Perro activo no encontrado.';
  end if;

  select * into v_exam from public.ucapsa_exams where id = p_exam_id for update;
  if not found then raise exception 'Examen UCAPSA no encontrado.'; end if;
  if v_exam.status <> 'published' then raise exception 'Sólo se capturan resultados sobre un examen publicado.'; end if;
  perform public.ucapsa_assert_competition_season_mutable(v_exam.season_id);

  select coalesce(max(a.attempt_number), 0) + 1 into v_attempt_number
  from public.ucapsa_exam_attempts a
  where a.exam_id = p_exam_id and a.dog_id = p_dog_id;

  insert into public.ucapsa_exam_attempts (
    exam_id, dog_id, attempt_number, status, is_official, presented_at, created_by
  ) values (
    p_exam_id, p_dog_id, v_attempt_number, 'draft', false, p_presented_at, auth.uid()
  ) returning id into v_id;

  insert into public.admin_audit_logs (admin_user_id, action, entity_type, entity_id, details)
  values (
    auth.uid(), 'trainer.exam_attempt.create', 'ucapsa_exam_attempt', v_id,
    jsonb_build_object('exam_id', p_exam_id, 'dog_id', p_dog_id, 'attempt_number', v_attempt_number)
  );

  return v_id;
end;
$$;

revoke all on function public.trainer_create_ucapsa_exam_attempt(uuid,uuid,timestamptz) from public, anon;
grant execute on function public.trainer_create_ucapsa_exam_attempt(uuid,uuid,timestamptz) to authenticated, service_role;

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
  v_existing boolean;
begin
  if not public.is_ucapsa_training_staff() then
    raise exception 'Solo staff de entrenamiento puede capturar resultados.'
      using errcode = '42501';
  end if;
  if p_points_awarded is null or p_points_awarded < 0 then
    raise exception 'La puntuación debe ser cero o mayor.';
  end if;

  select * into v_attempt from public.ucapsa_exam_attempts where id = p_attempt_id for update;
  if not found then raise exception 'Intento UCAPSA no encontrado.'; end if;
  if v_attempt.status = 'voided' then raise exception 'No se puede editar un intento anulado.'; end if;
  perform public.ucapsa_assert_exam_mutable(v_attempt.exam_id);

  select exists(
    select 1 from public.ucapsa_exam_item_results r
    where r.attempt_id = p_attempt_id and r.exam_item_id = p_exam_item_id
  ) into v_existing;

  if v_attempt.status in ('reviewed', 'published') and not v_existing then
    raise exception 'Un intento revisado/publicado no puede agregar ejercicios.';
  end if;

  insert into public.ucapsa_exam_item_results (
    attempt_id, exam_item_id, points_awarded, evaluator_note, updated_by
  ) values (
    p_attempt_id, p_exam_item_id, p_points_awarded, nullif(btrim(p_evaluator_note), ''), auth.uid()
  )
  on conflict (attempt_id, exam_item_id) do update
  set points_awarded = excluded.points_awarded,
      evaluator_note = excluded.evaluator_note,
      updated_by = auth.uid();

  insert into public.admin_audit_logs (admin_user_id, action, entity_type, entity_id, details)
  values (
    auth.uid(), 'trainer.exam_result.upsert', 'ucapsa_exam_attempt', p_attempt_id,
    jsonb_build_object('exam_item_id', p_exam_item_id, 'points_awarded', p_points_awarded)
  );

  return p_attempt_id;
end;
$$;

revoke all on function public.trainer_upsert_ucapsa_exam_item_result(uuid,uuid,numeric,text) from public, anon;
grant execute on function public.trainer_upsert_ucapsa_exam_item_result(uuid,uuid,numeric,text) to authenticated, service_role;

create or replace function public.trainer_review_ucapsa_exam_attempt(p_attempt_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_attempt public.ucapsa_exam_attempts%rowtype;
begin
  if not public.is_ucapsa_training_staff() then
    raise exception 'Solo staff de entrenamiento puede revisar intentos.'
      using errcode = '42501';
  end if;

  select * into v_attempt from public.ucapsa_exam_attempts where id = p_attempt_id for update;
  if not found then raise exception 'Intento UCAPSA no encontrado.'; end if;
  if v_attempt.status <> 'draft' then raise exception 'Sólo un borrador puede pasar a revisado.'; end if;

  update public.ucapsa_exam_attempts
  set status = 'reviewed', reviewed_at = clock_timestamp(), reviewed_by = auth.uid()
  where id = p_attempt_id;

  insert into public.admin_audit_logs (admin_user_id, action, entity_type, entity_id, details)
  values (
    auth.uid(), 'trainer.exam_attempt.review', 'ucapsa_exam_attempt', p_attempt_id, '{}'::jsonb
  );

  return p_attempt_id;
end;
$$;

revoke all on function public.trainer_review_ucapsa_exam_attempt(uuid) from public, anon;
grant execute on function public.trainer_review_ucapsa_exam_attempt(uuid) to authenticated, service_role;

comment on table public.dog_staff_notes is
  'Historial interno operativo del perro. No se expone a clientes; conserva observaciones de entrenamiento, conducta, interacción y seguridad.';
comment on function public.get_staff_class_rsvp_summary(date) is
  'Aforo operativo por horario y nivel. Comandos puede compartir un solo horario y seguir separado por Básico/Intermedio/Avanzado.';
comment on function public.get_staff_class_report(date,date) is
  'Reporte operativo agregado por clase real; resuelve versiones de horario, cancelaciones, RSVP y asistencia sin reescribir historia.';
