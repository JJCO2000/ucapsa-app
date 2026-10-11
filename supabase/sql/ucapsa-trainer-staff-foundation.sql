-- UCAPSA — rol Entrenador / Staff operativo
--
-- Principios:
-- - trainer NO es admin: no ve pagos, estadísticas financieras, campañas,
--   bajas de cuenta ni configuración interna.
-- - trainer ve sólo lo necesario para operar entrenamiento: clases, quién viene,
--   perros, notas internas operativas y captura de exámenes.
-- - los datos administrativos siguen protegidos por is_ucapsa_admin().
-- - una confirmación RSVP nunca sustituye una asistencia real.

alter type public.app_role add value if not exists 'trainer';

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
  );
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
  );
$$;

revoke all on function public.is_ucapsa_trainer() from public, anon;
revoke all on function public.is_ucapsa_staff() from public, anon;
grant execute on function public.is_ucapsa_trainer() to authenticated, service_role;
grant execute on function public.is_ucapsa_staff() to authenticated, service_role;

-- Sólo superadmin asigna/quita el rol operativo.
create or replace function public.super_admin_set_trainer_role(
  p_user_id uuid,
  p_enabled boolean
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before text;
  v_after text;
begin
  if not public.is_super_admin() then
    raise exception 'Solo super_admin puede cambiar el rol Entrenador.'
      using errcode = '42501';
  end if;

  if p_user_id = auth.uid() then
    raise exception 'No puedes convertir tu propia cuenta superadmin en Entrenador.'
      using errcode = '22023';
  end if;

  select p.role::text
    into v_before
  from public.profiles p
  where p.user_id = p_user_id
  for update;

  if not found then
    raise exception 'Perfil no encontrado.'
      using errcode = '22023';
  end if;

  if coalesce(p_enabled, false) then
    if v_before not in ('client', 'trainer') then
      raise exception 'Sólo una cuenta cliente puede convertirse en Entrenador. El rol actual es %.', v_before
        using errcode = '22023';
    end if;
    v_after := 'trainer';
  else
    if v_before <> 'trainer' then
      raise exception 'La cuenta no es Entrenador.'
        using errcode = '22023';
    end if;
    v_after := 'client';
  end if;

  update public.profiles
  set role = v_after::public.app_role,
      updated_at = clock_timestamp()
  where user_id = p_user_id;

  insert into public.admin_audit_logs (
    admin_user_id, action, entity_type, entity_id, details
  ) values (
    auth.uid(),
    'staff.role_change',
    'profile',
    (select id from public.profiles where user_id = p_user_id limit 1),
    jsonb_build_object(
      'user_id', p_user_id,
      'before', v_before,
      'after', v_after
    )
  );

  return v_after;
end;
$$;

revoke all on function public.super_admin_set_trainer_role(uuid,boolean)
  from public, anon;
grant execute on function public.super_admin_set_trainer_role(uuid,boolean)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Memoria operativa interna por perro.
-- Append-only: corregir/retirar significa archivar, no borrar historia.
-- ---------------------------------------------------------------------------

create table if not exists public.dog_staff_notes (
  id uuid primary key default gen_random_uuid(),
  dog_id uuid not null references public.dogs(id) on delete cascade,
  category text not null default 'general'
    check (category in ('behavior', 'incident', 'training', 'care', 'general')),
  severity text not null default 'info'
    check (severity in ('info', 'watch', 'important')),
  note text not null check (char_length(btrim(note)) between 1 and 2000),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  archived_at timestamptz,
  archived_by uuid references auth.users(id) on delete set null
);

create index if not exists dog_staff_notes_dog_created_idx
  on public.dog_staff_notes (dog_id, created_at desc);
create index if not exists dog_staff_notes_active_important_idx
  on public.dog_staff_notes (dog_id, severity)
  where archived_at is null;

alter table public.dog_staff_notes enable row level security;

revoke all on table public.dog_staff_notes from public, anon, authenticated;
grant select, insert, update on table public.dog_staff_notes to service_role;

create or replace function public.get_staff_dog_notes(p_dog_id uuid)
returns table (
  id uuid,
  dog_id uuid,
  category text,
  severity text,
  note text,
  created_by uuid,
  author_name text,
  created_at timestamptz,
  archived_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_ucapsa_staff() then
    raise exception 'Sólo UCAPSA Staff puede consultar notas operativas.'
      using errcode = '42501';
  end if;

  return query
  select
    n.id,
    n.dog_id,
    n.category,
    n.severity,
    n.note,
    n.created_by,
    coalesce(p.full_name, p.email, 'UCAPSA Staff')::text,
    n.created_at,
    n.archived_at
  from public.dog_staff_notes n
  left join public.profiles p on p.user_id = n.created_by
  where n.dog_id = p_dog_id
    and n.archived_at is null
  order by
    case n.severity when 'important' then 0 when 'watch' then 1 else 2 end,
    n.created_at desc;
end;
$$;

create or replace function public.add_staff_dog_note(
  p_dog_id uuid,
  p_category text,
  p_severity text,
  p_note text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_category text := lower(btrim(coalesce(p_category, 'general')));
  v_severity text := lower(btrim(coalesce(p_severity, 'info')));
  v_note text := btrim(coalesce(p_note, ''));
begin
  if not public.is_ucapsa_staff() then
    raise exception 'Sólo UCAPSA Staff puede registrar notas operativas.'
      using errcode = '42501';
  end if;
  if not exists (select 1 from public.dogs d where d.id = p_dog_id and d.is_active) then
    raise exception 'Perro activo no encontrado.'
      using errcode = '22023';
  end if;
  if v_category not in ('behavior', 'incident', 'training', 'care', 'general') then
    raise exception 'Categoría de nota no válida.'
      using errcode = '22023';
  end if;
  if v_severity not in ('info', 'watch', 'important') then
    raise exception 'Prioridad de nota no válida.'
      using errcode = '22023';
  end if;
  if char_length(v_note) < 1 or char_length(v_note) > 2000 then
    raise exception 'La nota debe tener entre 1 y 2000 caracteres.'
      using errcode = '22023';
  end if;

  insert into public.dog_staff_notes (
    dog_id, category, severity, note, created_by
  ) values (
    p_dog_id, v_category, v_severity, v_note, auth.uid()
  )
  returning id into v_id;

  insert into public.admin_audit_logs (
    admin_user_id, action, entity_type, entity_id, details
  ) values (
    auth.uid(),
    'staff.dog_note.add',
    'dog',
    p_dog_id,
    jsonb_build_object('note_id', v_id, 'category', v_category, 'severity', v_severity)
  );

  return v_id;
end;
$$;

create or replace function public.archive_staff_dog_note(p_note_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_note public.dog_staff_notes%rowtype;
begin
  if not public.is_ucapsa_staff() then
    raise exception 'Sólo UCAPSA Staff puede archivar notas operativas.'
      using errcode = '42501';
  end if;

  select *
    into v_note
  from public.dog_staff_notes
  where id = p_note_id
  for update;

  if not found then
    raise exception 'Nota no encontrada.'
      using errcode = '22023';
  end if;

  if not public.is_ucapsa_admin() and v_note.created_by <> auth.uid() then
    raise exception 'Un Entrenador sólo puede archivar sus propias notas.'
      using errcode = '42501';
  end if;

  update public.dog_staff_notes
  set archived_at = coalesce(archived_at, clock_timestamp()),
      archived_by = coalesce(archived_by, auth.uid())
  where id = p_note_id;

  return p_note_id;
end;
$$;

revoke all on function public.get_staff_dog_notes(uuid) from public, anon;
revoke all on function public.add_staff_dog_note(uuid,text,text,text) from public, anon;
revoke all on function public.archive_staff_dog_note(uuid) from public, anon;
grant execute on function public.get_staff_dog_notes(uuid) to authenticated, service_role;
grant execute on function public.add_staff_dog_note(uuid,text,text,text) to authenticated, service_role;
grant execute on function public.archive_staff_dog_note(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Directorio de perros: sólo información operativa, sin datos financieros.
-- ---------------------------------------------------------------------------

create or replace function public.get_staff_dog_directory(p_query text default null)
returns table (
  dog_id uuid,
  dog_name text,
  owner_name text,
  program_code text,
  program_level text,
  is_member boolean,
  important_notes integer,
  watch_notes integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_query text := lower(btrim(coalesce(p_query, '')));
begin
  if not public.is_ucapsa_staff() then
    raise exception 'Sólo UCAPSA Staff puede consultar perros.'
      using errcode = '42501';
  end if;

  return query
  select
    d.id,
    d.name::text,
    coalesce(p.full_name, 'Cliente UCAPSA')::text,
    e.program_code,
    e.program_level,
    exists (
      select 1
      from public.memberships m
      where m.user_id = d.user_id
        and m.status = 'active'
        and (m.start_date is null or m.start_date <= current_date)
        and (m.end_date is null or m.end_date >= current_date)
    ),
    (
      select count(*)::integer
      from public.dog_staff_notes n
      where n.dog_id = d.id
        and n.archived_at is null
        and n.severity = 'important'
    ),
    (
      select count(*)::integer
      from public.dog_staff_notes n
      where n.dog_id = d.id
        and n.archived_at is null
        and n.severity = 'watch'
    )
  from public.dogs d
  left join public.profiles p on p.user_id = d.user_id
  left join lateral (
    select
      pr.code::text as program_code,
      pe.program_level::text as program_level
    from public.program_enrollments pe
    join public.programs pr on pr.id = pe.program_id
    where pe.dog_id = d.id
      and pe.status = 'active'
    order by pe.created_at desc
    limit 1
  ) e on true
  where d.is_active = true
    and (
      v_query = ''
      or lower(d.name) like '%' || v_query || '%'
      or lower(coalesce(p.full_name, '')) like '%' || v_query || '%'
    )
  order by d.name asc
  limit 500;
end;
$$;

create or replace function public.get_staff_dog_profile(p_dog_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  if not public.is_ucapsa_staff() then
    raise exception 'Sólo UCAPSA Staff puede consultar el expediente operativo.'
      using errcode = '42501';
  end if;

  select jsonb_build_object(
    'dog_id', d.id,
    'name', d.name,
    'owner_name', coalesce(p.full_name, 'Cliente UCAPSA'),
    'breed', d.breed,
    'birth_date', d.birth_date,
    'sex', d.sex,
    'weight_kg', d.weight_kg,
    'allergies', d.allergies,
    'medications', d.medications,
    'feeding_notes', d.feeding_notes,
    'behavior_notes', d.behavior_notes,
    'veterinarian_name', d.veterinarian_name,
    'veterinarian_phone', d.veterinarian_phone,
    'emergency_contact_name', d.emergency_contact_name,
    'emergency_contact_phone', d.emergency_contact_phone,
    'is_member', exists (
      select 1 from public.memberships m
      where m.user_id = d.user_id
        and m.status = 'active'
        and (m.start_date is null or m.start_date <= current_date)
        and (m.end_date is null or m.end_date >= current_date)
    ),
    'active_training', (
      select jsonb_agg(jsonb_build_object(
        'enrollment_id', pe.id,
        'program_code', pr.code,
        'program_name', pr.name,
        'program_level', pe.program_level,
        'attendance_count', pe.attendances_count
      ) order by pe.created_at desc)
      from public.program_enrollments pe
      join public.programs pr on pr.id = pe.program_id
      where pe.dog_id = d.id and pe.status = 'active'
    )
  )
  into v_result
  from public.dogs d
  left join public.profiles p on p.user_id = d.user_id
  where d.id = p_dog_id
    and d.is_active = true;

  if v_result is null then
    raise exception 'Perro activo no encontrado.'
      using errcode = '22023';
  end if;

  return v_result;
end;
$$;

revoke all on function public.get_staff_dog_directory(text) from public, anon;
revoke all on function public.get_staff_dog_profile(uuid) from public, anon;
grant execute on function public.get_staff_dog_directory(text) to authenticated, service_role;
grant execute on function public.get_staff_dog_profile(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Lista operativa por fecha. Respeta la versión efectiva del horario y
-- cancelaciones. Comandos usa un horario único; el nivel viene de la inscripción.
-- ---------------------------------------------------------------------------

create or replace function public.get_staff_class_roster(p_class_date date)
returns table (
  enrollment_id uuid,
  schedule_id uuid,
  class_date date,
  start_time time,
  program_code text,
  program_name text,
  program_level text,
  customer_name text,
  dog_id uuid,
  dog_name text,
  rsvp_response text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_ucapsa_staff() then
    raise exception 'Sólo UCAPSA Staff puede consultar la lista de clase.'
      using errcode = '42501';
  end if;

  return query
  select
    e.id,
    e.schedule_id,
    p_class_date,
    effective.start_time,
    p.code::text,
    p.name::text,
    e.program_level::text,
    coalesce(pr.full_name, 'Cliente UCAPSA')::text,
    e.dog_id,
    coalesce(d.name, e.dog_name, 'Perro')::text,
    r.response::text
  from public.program_enrollments e
  join public.programs p
    on p.id = e.program_id
   and p.is_active = true
  join lateral public.get_effective_program_schedule(e.schedule_id, p_class_date) effective
    on true
  left join public.profiles pr on pr.user_id = e.user_id
  left join public.dogs d on d.id = e.dog_id
  left join public.program_class_rsvps r
    on r.enrollment_id = e.id
   and r.class_date = p_class_date
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
  order by
    effective.start_time,
    p.code,
    e.program_level,
    coalesce(d.name, e.dog_name, 'Perro');
end;
$$;

revoke all on function public.get_staff_class_roster(date) from public, anon;
grant execute on function public.get_staff_class_roster(date)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Exámenes: Entrenador captura; Admin conserva configuración/publicación/oficial.
-- ---------------------------------------------------------------------------

create or replace function public.get_staff_exam_catalog()
returns table (
  exam_id uuid,
  exam_code text,
  exam_title text,
  exam_date date,
  season_id uuid,
  season_name text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_ucapsa_staff() then
    raise exception 'Sólo UCAPSA Staff puede consultar exámenes.'
      using errcode = '42501';
  end if;

  return query
  select
    e.id,
    e.code::text,
    e.title::text,
    e.exam_date,
    s.id,
    s.name::text
  from public.ucapsa_exams e
  join public.ucapsa_competition_seasons s on s.id = e.season_id
  where e.status = 'published'
    and s.status in ('active', 'reopened')
  order by e.exam_date desc nulls last, e.sort_order, e.title;
end;
$$;

create or replace function public.get_staff_exam_workspace(p_exam_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  if not public.is_ucapsa_staff() then
    raise exception 'Sólo UCAPSA Staff puede consultar exámenes.'
      using errcode = '42501';
  end if;

  select jsonb_build_object(
    'exam', jsonb_build_object(
      'id', e.id,
      'code', e.code,
      'title', e.title,
      'description', e.description,
      'exam_date', e.exam_date,
      'status', e.status,
      'season_id', s.id,
      'season_name', s.name,
      'season_status', s.status
    ),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id,
        'item_number', i.item_number,
        'title', i.title,
        'description', i.description,
        'max_points', i.max_points,
        'sort_order', i.sort_order
      ) order by i.sort_order, i.item_number)
      from public.ucapsa_exam_items i
      where i.exam_id = e.id
    ), '[]'::jsonb),
    'dogs', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', d.id,
        'name', d.name,
        'owner_name', coalesce(p.full_name, 'Cliente UCAPSA')
      ) order by d.name)
      from public.dogs d
      left join public.profiles p on p.user_id = d.user_id
      where d.is_active = true
    ), '[]'::jsonb),
    'attempts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', a.id,
        'dog_id', a.dog_id,
        'dog_name', d.name,
        'attempt_number', a.attempt_number,
        'status', a.status,
        'presented_at', a.presented_at,
        'is_official', a.is_official
      ) order by a.presented_at desc)
      from public.ucapsa_exam_attempts a
      join public.dogs d on d.id = a.dog_id
      where a.exam_id = e.id
        and a.status <> 'voided'
      limit 200
    ), '[]'::jsonb)
  )
  into v_result
  from public.ucapsa_exams e
  join public.ucapsa_competition_seasons s on s.id = e.season_id
  where e.id = p_exam_id
    and e.status = 'published'
    and s.status in ('active', 'reopened');

  if v_result is null then
    raise exception 'Examen publicado no disponible.'
      using errcode = '22023';
  end if;

  return v_result;
end;
$$;

create or replace function public.get_staff_exam_attempt_detail(p_attempt_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  if not public.is_ucapsa_staff() then
    raise exception 'Sólo UCAPSA Staff puede consultar intentos.'
      using errcode = '42501';
  end if;

  select jsonb_build_object(
    'attempt', to_jsonb(a),
    'exam', jsonb_build_object('id', e.id, 'code', e.code, 'title', e.title, 'status', e.status),
    'dog', jsonb_build_object('id', d.id, 'name', d.name, 'owner_name', coalesce(p.full_name, 'Cliente UCAPSA')),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id,
        'item_number', i.item_number,
        'title', i.title,
        'description', i.description,
        'max_points', i.max_points,
        'sort_order', i.sort_order
      ) order by i.sort_order, i.item_number)
      from public.ucapsa_exam_items i
      where i.exam_id = a.exam_id
    ), '[]'::jsonb),
    'results', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id,
        'exam_item_id', r.exam_item_id,
        'points_awarded', r.points_awarded,
        'evaluator_note', r.evaluator_note
      ))
      from public.ucapsa_exam_item_results r
      where r.attempt_id = a.id
    ), '[]'::jsonb)
  )
  into v_result
  from public.ucapsa_exam_attempts a
  join public.ucapsa_exams e on e.id = a.exam_id
  join public.dogs d on d.id = a.dog_id
  left join public.profiles p on p.user_id = d.user_id
  where a.id = p_attempt_id
    and a.status <> 'voided';

  if v_result is null then
    raise exception 'Intento no disponible.'
      using errcode = '22023';
  end if;

  return v_result;
end;
$$;

create or replace function public.staff_create_ucapsa_exam_attempt(
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
    raise exception 'Sólo UCAPSA Staff puede capturar exámenes.'
      using errcode = '42501';
  end if;
  if p_presented_at is null then
    raise exception 'La fecha del examen es obligatoria.'
      using errcode = '22023';
  end if;
  if not exists (select 1 from public.dogs d where d.id = p_dog_id and d.is_active) then
    raise exception 'Perro activo no encontrado.'
      using errcode = '22023';
  end if;

  select *
    into v_exam
  from public.ucapsa_exams
  where id = p_exam_id
  for update;

  if not found or v_exam.status <> 'published' then
    raise exception 'Sólo se capturan resultados sobre un examen publicado.'
      using errcode = '22023';
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
    'staff.exam_attempt.create',
    'ucapsa_exam_attempt',
    v_id,
    jsonb_build_object('exam_id', p_exam_id, 'dog_id', p_dog_id, 'attempt_number', v_attempt_number)
  );

  return v_id;
end;
$$;

create or replace function public.staff_upsert_ucapsa_exam_item_result(
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
  v_max numeric;
begin
  if not public.is_ucapsa_staff() then
    raise exception 'Sólo UCAPSA Staff puede capturar resultados.'
      using errcode = '42501';
  end if;
  if p_points_awarded is null or p_points_awarded < 0 then
    raise exception 'La puntuación debe ser cero o mayor.'
      using errcode = '22023';
  end if;

  select *
    into v_attempt
  from public.ucapsa_exam_attempts
  where id = p_attempt_id
  for update;

  if not found or v_attempt.status <> 'draft' then
    raise exception 'El Entrenador sólo puede editar intentos en borrador.'
      using errcode = '22023';
  end if;

  select i.max_points
    into v_max
  from public.ucapsa_exam_items i
  where i.id = p_exam_item_id
    and i.exam_id = v_attempt.exam_id;

  if not found then
    raise exception 'Ejercicio no pertenece a este examen.'
      using errcode = '22023';
  end if;
  if p_points_awarded > v_max then
    raise exception 'La puntuación supera el máximo del ejercicio (%).', v_max
      using errcode = '22023';
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

  return p_attempt_id;
end;
$$;

create or replace function public.staff_review_ucapsa_exam_attempt(p_attempt_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_attempt public.ucapsa_exam_attempts%rowtype;
  v_items integer;
  v_results integer;
begin
  if not public.is_ucapsa_staff() then
    raise exception 'Sólo UCAPSA Staff puede cerrar la captura.'
      using errcode = '42501';
  end if;

  select *
    into v_attempt
  from public.ucapsa_exam_attempts
  where id = p_attempt_id
  for update;

  if not found or v_attempt.status <> 'draft' then
    raise exception 'Sólo un intento en borrador puede pasar a revisión.'
      using errcode = '22023';
  end if;

  select count(*)::integer into v_items
  from public.ucapsa_exam_items i
  where i.exam_id = v_attempt.exam_id;

  select count(*)::integer into v_results
  from public.ucapsa_exam_item_results r
  join public.ucapsa_exam_items i on i.id = r.exam_item_id
  where r.attempt_id = p_attempt_id
    and i.exam_id = v_attempt.exam_id;

  if v_items = 0 or v_results <> v_items then
    raise exception 'Faltan ejercicios por calificar: % de %.', v_results, v_items
      using errcode = '22023';
  end if;

  update public.ucapsa_exam_attempts
  set status = 'reviewed',
      reviewed_at = clock_timestamp(),
      reviewed_by = auth.uid()
  where id = p_attempt_id;

  insert into public.admin_audit_logs (
    admin_user_id, action, entity_type, entity_id, details
  ) values (
    auth.uid(),
    'staff.exam_attempt.review',
    'ucapsa_exam_attempt',
    p_attempt_id,
    '{}'::jsonb
  );

  return p_attempt_id;
end;
$$;

revoke all on function public.get_staff_exam_catalog() from public, anon;
revoke all on function public.get_staff_exam_workspace(uuid) from public, anon;
revoke all on function public.get_staff_exam_attempt_detail(uuid) from public, anon;
revoke all on function public.staff_create_ucapsa_exam_attempt(uuid,uuid,timestamptz) from public, anon;
revoke all on function public.staff_upsert_ucapsa_exam_item_result(uuid,uuid,numeric,text) from public, anon;
revoke all on function public.staff_review_ucapsa_exam_attempt(uuid) from public, anon;
grant execute on function public.get_staff_exam_catalog() to authenticated, service_role;
grant execute on function public.get_staff_exam_workspace(uuid) to authenticated, service_role;
grant execute on function public.get_staff_exam_attempt_detail(uuid) to authenticated, service_role;
grant execute on function public.staff_create_ucapsa_exam_attempt(uuid,uuid,timestamptz) to authenticated, service_role;
grant execute on function public.staff_upsert_ucapsa_exam_item_result(uuid,uuid,numeric,text) to authenticated, service_role;
grant execute on function public.staff_review_ucapsa_exam_attempt(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Reporte administrativo por periodo. Sólo Admin/Superadmin.
-- Devuelve evidencia real; no infiere aprendizaje ni inventa estados.
-- ---------------------------------------------------------------------------

create or replace function public.get_admin_period_report(
  p_from date,
  p_to date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  if not public.is_ucapsa_admin() then
    raise exception 'Sólo Admin puede exportar reportes administrativos.'
      using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_to < p_from then
    raise exception 'Rango de fechas inválido.'
      using errcode = '22023';
  end if;
  if (p_to - p_from) > 366 then
    raise exception 'El reporte admite como máximo 367 días.'
      using errcode = '22023';
  end if;

  select jsonb_build_object(
    'from', p_from,
    'to', p_to,
    'generated_at', clock_timestamp(),
    'attendances', coalesce((
      select jsonb_agg(jsonb_build_object(
        'date', a.attendance_date,
        'program', pr.name,
        'program_code', pr.code,
        'level', e.program_level,
        'dog', coalesce(d.name, e.dog_name, 'Perro'),
        'customer', coalesce(p.full_name, 'Cliente UCAPSA'),
        'source', a.source
      ) order by a.attendance_date, pr.code, e.program_level, coalesce(d.name, e.dog_name))
      from public.program_attendances a
      join public.program_enrollments e on e.id = a.enrollment_id
      join public.programs pr on pr.id = e.program_id
      left join public.dogs d on d.id = e.dog_id
      left join public.profiles p on p.user_id = e.user_id
      where a.attendance_date between p_from and p_to
    ), '[]'::jsonb),
    'rsvps', coalesce((
      select jsonb_agg(jsonb_build_object(
        'date', r.class_date,
        'response', r.response,
        'program', pr.name,
        'program_code', pr.code,
        'level', e.program_level,
        'dog', coalesce(d.name, e.dog_name, 'Perro'),
        'customer', coalesce(p.full_name, 'Cliente UCAPSA')
      ) order by r.class_date, pr.code, e.program_level)
      from public.program_class_rsvps r
      join public.program_enrollments e on e.id = r.enrollment_id
      join public.programs pr on pr.id = e.program_id
      left join public.dogs d on d.id = e.dog_id
      left join public.profiles p on p.user_id = e.user_id
      where r.class_date between p_from and p_to
    ), '[]'::jsonb),
    'member_visits', coalesce((
      select jsonb_agg(jsonb_build_object(
        'date', v.visit_date,
        'customer', coalesce(p.full_name, 'Cliente UCAPSA'),
        'source', v.source
      ) order by v.visit_date)
      from public.member_visits v
      left join public.profiles p on p.user_id = v.user_id
      where v.visit_date between p_from and p_to
    ), '[]'::jsonb),
    'payments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'paid_at', pay.paid_at,
        'customer', coalesce(p.full_name, 'Cliente UCAPSA'),
        'concept', pay.concept,
        'amount', pay.amount,
        'method', pay.payment_method,
        'status', pay.status
      ) order by pay.paid_at)
      from public.payments pay
      left join public.profiles p on p.user_id = pay.user_id
      where pay.paid_at is not null
        and (pay.paid_at at time zone 'America/Mexico_City')::date between p_from and p_to
    ), '[]'::jsonb),
    'exams', coalesce((
      select jsonb_agg(jsonb_build_object(
        'presented_at', a.presented_at,
        'exam', e.title,
        'dog', d.name,
        'status', a.status,
        'official', a.is_official,
        'total_points', s.total_points_awarded,
        'max_points', s.max_points
      ) order by a.presented_at)
      from public.ucapsa_exam_attempts a
      join public.ucapsa_exams e on e.id = a.exam_id
      join public.dogs d on d.id = a.dog_id
      left join public.ucapsa_exam_attempt_summary s on s.attempt_id = a.id
      where (a.presented_at at time zone 'America/Mexico_City')::date between p_from and p_to
    ), '[]'::jsonb)
  )
  into v_result;

  return v_result;
end;
$$;

revoke all on function public.get_admin_period_report(date,date) from public, anon;
grant execute on function public.get_admin_period_report(date,date)
  to authenticated, service_role;
