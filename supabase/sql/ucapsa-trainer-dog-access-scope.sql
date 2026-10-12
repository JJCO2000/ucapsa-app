-- UCAPSA — alcance de perros para el workspace Entrenador
--
-- Admin/Superadmin conservan acceso completo.
-- Entrenador sólo puede acceder a perros vinculados a una inscripción UCAPSA
-- activa o completada. La UI ya seguía este flujo; este archivo hace que el
-- backend imponga la misma frontera aunque se intente llamar un RPC por UUID.

begin;

create or replace function public.can_ucapsa_staff_access_dog(p_dog_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    case
      when public.is_ucapsa_admin() then true
      else
        exists (
          select 1
          from public.profiles p
          where p.user_id = auth.uid()
            and p.role::text = 'trainer'
        )
        and exists (
          select 1
          from public.program_enrollments e
          where e.dog_id = p_dog_id
            and e.status in ('active', 'completed')
        )
    end
$$;

revoke all on function public.can_ucapsa_staff_access_dog(uuid) from public, anon;
grant execute on function public.can_ucapsa_staff_access_dog(uuid) to authenticated, service_role;

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
  if not public.is_ucapsa_staff()
     or not public.can_ucapsa_staff_access_dog(p_dog_id) then
    raise exception 'El perro no está disponible para esta cuenta de staff.'
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
  if not public.is_ucapsa_staff()
     or not public.can_ucapsa_staff_access_dog(p_dog_id) then
    raise exception 'El perro no está disponible para esta cuenta de staff.'
      using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.dogs d where d.id = p_dog_id and d.is_active = true
  ) then
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
    and public.can_ucapsa_staff_access_dog(dog_id)
  for update;

  if not found then
    raise exception 'Nota no encontrada o no disponible.'
      using errcode = '22023';
  end if;

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

  select n.dog_id
    into v_dog_id
  from public.ucapsa_staff_dog_notes n
  where n.id = p_note_id
    and public.can_ucapsa_staff_access_dog(n.dog_id)
  for update;

  if v_dog_id is null then
    raise exception 'Nota no encontrada o no disponible.'
      using errcode = '22023';
  end if;

  update public.ucapsa_staff_dog_notes
  set
    resolved_at = case when coalesce(p_resolved, true) then clock_timestamp() else null end,
    resolved_by = case when coalesce(p_resolved, true) then auth.uid() else null end,
    updated_by = auth.uid(),
    updated_at = clock_timestamp()
  where id = p_note_id;

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

create or replace function public.get_staff_dog_operational_profile(
  p_dog_id uuid
)
returns table (
  dog_id uuid,
  dog_name text,
  owner_name text,
  breed text,
  sex text,
  birth_date date,
  weight_kg numeric,
  allergies text,
  medications text,
  feeding_notes text,
  behavior_notes text,
  veterinarian_name text,
  veterinarian_phone text,
  emergency_contact_name text,
  emergency_contact_phone text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_ucapsa_staff()
     or not public.can_ucapsa_staff_access_dog(p_dog_id) then
    raise exception 'El perro no está disponible para esta cuenta de staff.'
      using errcode = '42501';
  end if;

  return query
  select
    d.id,
    d.name::text,
    coalesce(p.full_name, p.email, 'Cliente UCAPSA')::text,
    d.breed,
    d.sex,
    d.birth_date,
    d.weight_kg,
    d.allergies,
    d.medications,
    d.feeding_notes,
    d.behavior_notes,
    d.veterinarian_name,
    d.veterinarian_phone,
    d.emergency_contact_name,
    d.emergency_contact_phone
  from public.dogs d
  left join public.profiles p on p.user_id = d.user_id
  where d.id = p_dog_id
    and d.is_active = true
  limit 1;
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
    and public.can_ucapsa_staff_access_dog(d.id)
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
  if not public.can_ucapsa_staff_access_dog(p_dog_id) then
    raise exception 'El perro no está disponible para esta cuenta de staff.'
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
  where a.id = p_attempt_id
    and public.can_ucapsa_staff_access_dog(a.dog_id);

  if v_payload is null then
    raise exception 'Intento no encontrado o no disponible.'
      using errcode = '22023';
  end if;
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

  if not public.can_ucapsa_staff_access_dog(v_attempt.dog_id) then
    raise exception 'El intento no está disponible para esta cuenta de staff.'
      using errcode = '42501';
  end if;
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
  if not public.can_ucapsa_staff_access_dog(v_attempt.dog_id) then
    raise exception 'El intento no está disponible para esta cuenta de staff.'
      using errcode = '42501';
  end if;
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

revoke all on function public.get_staff_dog_notes(uuid) from public, anon;
revoke all on function public.staff_add_dog_note(uuid,text,text,text,date) from public, anon;
revoke all on function public.staff_update_dog_note(uuid,text,text,text,date) from public, anon;
revoke all on function public.staff_resolve_dog_note(uuid,boolean) from public, anon;
revoke all on function public.get_staff_dog_operational_profile(uuid) from public, anon;
revoke all on function public.get_trainer_exam_dogs() from public, anon;
revoke all on function public.trainer_create_ucapsa_exam_attempt(uuid,uuid,timestamptz) from public, anon;
revoke all on function public.get_trainer_exam_attempt(uuid) from public, anon;
revoke all on function public.trainer_upsert_ucapsa_exam_item_result(uuid,uuid,numeric,text) from public, anon;
revoke all on function public.trainer_review_ucapsa_exam_attempt(uuid) from public, anon;

grant execute on function public.get_staff_dog_notes(uuid) to authenticated, service_role;
grant execute on function public.staff_add_dog_note(uuid,text,text,text,date) to authenticated, service_role;
grant execute on function public.staff_update_dog_note(uuid,text,text,text,date) to authenticated, service_role;
grant execute on function public.staff_resolve_dog_note(uuid,boolean) to authenticated, service_role;
grant execute on function public.get_staff_dog_operational_profile(uuid) to authenticated, service_role;
grant execute on function public.get_trainer_exam_dogs() to authenticated, service_role;
grant execute on function public.trainer_create_ucapsa_exam_attempt(uuid,uuid,timestamptz) to authenticated, service_role;
grant execute on function public.get_trainer_exam_attempt(uuid) to authenticated, service_role;
grant execute on function public.trainer_upsert_ucapsa_exam_item_result(uuid,uuid,numeric,text) to authenticated, service_role;
grant execute on function public.trainer_review_ucapsa_exam_attempt(uuid) to authenticated, service_role;

comment on function public.can_ucapsa_staff_access_dog(uuid) is
  'Admin/Superadmin pueden acceder a cualquier perro; Entrenador sólo a perros con inscripción UCAPSA activa o completada.';

commit;
