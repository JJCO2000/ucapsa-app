-- UCAPSA — extensión del modo Entrenamiento
--
-- Añade capacidades operativas sin convertir Entrenador en Admin:
-- 1) cargar la definición de un examen como BORRADOR;
-- 2) publicar ese examen cuando esté listo;
-- 3) consultar únicamente datos del perro útiles para entrenamiento/seguridad.
--
-- La oficialidad de intentos/resultados, pagos, membresías y configuración global
-- siguen fuera de esta superficie.

create or replace function public.trainer_create_ucapsa_exam_draft(
  p_code text,
  p_title text,
  p_exam_date date,
  p_items jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_season_id uuid;
  v_exam_id uuid;
  v_code text := nullif(btrim(coalesce(p_code, '')), '');
  v_title text := nullif(btrim(coalesce(p_title, '')), '');
  v_item jsonb;
  v_ord bigint;
  v_item_title text;
  v_item_description text;
  v_max_points numeric;
begin
  if not public.is_ucapsa_staff() then
    raise exception 'Solo staff UCAPSA puede cargar exámenes.'
      using errcode = '42501';
  end if;

  if v_code is null or v_title is null then
    raise exception 'Código y nombre del examen son obligatorios.'
      using errcode = '22023';
  end if;

  if p_items is null
     or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) = 0 then
    raise exception 'El examen debe contener al menos un ejercicio.'
      using errcode = '22023';
  end if;

  if jsonb_array_length(p_items) > 100 then
    raise exception 'Un examen puede contener como máximo 100 ejercicios.'
      using errcode = '22023';
  end if;

  select s.id
    into v_season_id
  from public.ucapsa_competition_seasons s
  where s.status in ('active', 'reopened')
  order by
    case when s.status = 'active' then 0 else 1 end,
    s.activated_at desc nulls last,
    s.reopened_at desc nulls last,
    s.starts_at desc
  limit 1;

  if v_season_id is null then
    raise exception 'No hay una temporada activa. Administración debe abrirla antes de cargar exámenes.'
      using errcode = '55000';
  end if;

  perform public.ucapsa_assert_competition_season_mutable(v_season_id);

  if exists (
    select 1
    from public.ucapsa_exams e
    where e.season_id = v_season_id
      and lower(btrim(e.code)) = lower(v_code)
  ) then
    raise exception 'Ya existe un examen con ese código en la temporada activa.'
      using errcode = '23505';
  end if;

  insert into public.ucapsa_exams (
    season_id,
    code,
    title,
    description,
    exam_date,
    is_required_for_ranking,
    sort_order,
    status,
    created_by
  ) values (
    v_season_id,
    v_code,
    v_title,
    null,
    p_exam_date,
    true,
    0,
    'draft',
    auth.uid()
  )
  returning id into v_exam_id;

  for v_item, v_ord in
    select value, ordinality
    from jsonb_array_elements(p_items) with ordinality
  loop
    v_item_title := nullif(btrim(coalesce(v_item->>'title', '')), '');
    v_item_description := nullif(btrim(coalesce(v_item->>'description', '')), '');

    begin
      v_max_points := (v_item->>'max_points')::numeric;
    exception when others then
      v_max_points := null;
    end;

    if v_item_title is null then
      raise exception 'El ejercicio % no tiene nombre.', v_ord
        using errcode = '22023';
    end if;

    if v_max_points is null or v_max_points <= 0 then
      raise exception 'El ejercicio % necesita puntos máximos mayores que cero.', v_ord
        using errcode = '22023';
    end if;

    insert into public.ucapsa_exam_items (
      exam_id,
      item_number,
      title,
      description,
      max_points,
      sort_order
    ) values (
      v_exam_id,
      v_ord::integer,
      v_item_title,
      v_item_description,
      v_max_points,
      v_ord::integer
    );
  end loop;

  insert into public.admin_audit_logs (
    admin_user_id,
    action,
    entity_type,
    entity_id,
    details
  ) values (
    auth.uid(),
    'ucapsa_exam.staff_draft_upload',
    'ucapsa_exam',
    v_exam_id,
    jsonb_build_object(
      'season_id', v_season_id,
      'code', v_code,
      'title', v_title,
      'exam_date', p_exam_date,
      'items_count', jsonb_array_length(p_items),
      'result', 'draft_ready_for_staff_publish'
    )
  );

  return v_exam_id;
end;
$$;

revoke all on function public.trainer_create_ucapsa_exam_draft(text,text,date,jsonb)
  from public, anon;
grant execute on function public.trainer_create_ucapsa_exam_draft(text,text,date,jsonb)
  to authenticated, service_role;



create or replace function public.staff_publish_ucapsa_exam(
  p_exam_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_exam public.ucapsa_exams%rowtype;
begin
  if not public.is_ucapsa_staff() then
    raise exception 'Solo staff UCAPSA puede publicar exámenes.'
      using errcode = '42501';
  end if;

  select *
    into v_exam
  from public.ucapsa_exams
  where id = p_exam_id
  for update;

  if not found then
    raise exception 'Examen UCAPSA no encontrado.'
      using errcode = '22023';
  end if;

  if v_exam.status <> 'draft' then
    raise exception 'Solo un examen en borrador puede publicarse.'
      using errcode = '22023';
  end if;

  -- El trigger canónico de exámenes valida temporada activa/reabierta y que
  -- exista al menos un ejercicio antes de permitir draft -> published.
  update public.ucapsa_exams
  set
    status = 'published',
    published_at = now(),
    published_by = auth.uid()
  where id = p_exam_id;

  insert into public.admin_audit_logs (
    admin_user_id,
    action,
    entity_type,
    entity_id,
    details
  ) values (
    auth.uid(),
    'ucapsa_exam.staff_publish',
    'ucapsa_exam',
    p_exam_id,
    jsonb_build_object(
      'previous_status', v_exam.status,
      'new_status', 'published'
    )
  );

  return p_exam_id;
end;
$$;

revoke all on function public.staff_publish_ucapsa_exam(uuid)
  from public, anon;
grant execute on function public.staff_publish_ucapsa_exam(uuid)
  to authenticated, service_role;

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
  if not public.is_ucapsa_staff() then
    raise exception 'Solo staff UCAPSA puede consultar datos operativos del perro.'
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

revoke all on function public.get_staff_dog_operational_profile(uuid)
  from public, anon;
grant execute on function public.get_staff_dog_operational_profile(uuid)
  to authenticated, service_role;

comment on function public.trainer_create_ucapsa_exam_draft(text,text,date,jsonb) is
  'Carga un examen como borrador para que staff de Entrenamiento pueda revisarlo y publicarlo.';
comment on function public.staff_publish_ucapsa_exam(uuid) is
  'Permite a staff de Entrenamiento publicar la definición del examen; no oficializa intentos ni cambia niveles.';
comment on function public.get_staff_dog_operational_profile(uuid) is
  'Devuelve únicamente datos del perro útiles para entrenamiento, seguridad y emergencia.';


create or replace function public.get_staff_exam_drafts()
returns table (
  exam_id uuid,
  exam_code text,
  exam_title text,
  exam_date date,
  season_name text,
  item_count integer,
  max_points numeric,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_ucapsa_staff() then
    raise exception 'Solo staff UCAPSA puede consultar borradores de examen.'
      using errcode = '42501';
  end if;

  return query
  select
    e.id,
    e.code::text,
    e.title::text,
    e.exam_date,
    s.name::text,
    count(i.id)::integer,
    coalesce(sum(i.max_points), 0)::numeric,
    e.created_at
  from public.ucapsa_exams e
  join public.ucapsa_competition_seasons s on s.id = e.season_id
  left join public.ucapsa_exam_items i on i.exam_id = e.id
  where e.status = 'draft'
    and s.status in ('active', 'reopened')
  group by e.id, e.code, e.title, e.exam_date, s.name, e.created_at
  order by e.created_at desc;
end;
$$;

revoke all on function public.get_staff_exam_drafts()
  from public, anon;
grant execute on function public.get_staff_exam_drafts()
  to authenticated, service_role;

comment on function public.get_staff_exam_drafts() is
  'Borradores de examen visibles al staff de entrenamiento y listos para publicación por ese mismo staff.';
