-- Part 4: restore trainer XLSX import while preserving exam import lifecycle.
-- Correct canonical order: draft -> validated -> committed.
-- Does not alter existing rows or grant permissions to non-staff.
begin;

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

  -- Keep the canonical audit lifecycle: draft -> validated -> committed.
  -- All rows and scores have already passed validation before this point.
  update public.ucapsa_import_batches
  set
    status = 'validated',
    metadata = metadata || jsonb_build_object(
      'exam_snapshot', public.ucapsa_exam_import_snapshot(p_exam_id),
      'validated_rows', v_rows_total,
      'validated_at', clock_timestamp()
    ),
    updated_at = clock_timestamp()
  where id = v_batch_id;

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

revoke all on function public.trainer_import_ucapsa_exam_results(uuid,text,jsonb) from public, anon;
grant execute on function public.trainer_import_ucapsa_exam_results(uuid,text,jsonb) to authenticated, service_role;

commit;
