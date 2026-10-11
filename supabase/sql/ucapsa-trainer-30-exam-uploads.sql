-- UCAPSA — uploads operativos de Entrenador
--
-- Entrenador puede:
-- 1) cargar la definición de un examen como BORRADOR;
-- 2) importar calificaciones a un examen ya PUBLICADO;
-- 3) dejar esos intentos en REVIEWED.
--
-- Entrenador NO puede publicar el examen, publicar resultados, volverlos
-- oficiales, cambiar temporada/ranking ni anular historial.

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
  if not public.is_ucapsa_training_staff() then
    raise exception 'Solo staff de entrenamiento puede cargar exámenes.'
      using errcode = '42501';
  end if;

  if v_code is null or v_title is null then
    raise exception 'Código y título son obligatorios.'
      using errcode = '22023';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'El examen debe contener al menos un ejercicio.'
      using errcode = '22023';
  end if;

  select s.id
    into v_season_id
  from public.ucapsa_competition_seasons s
  where s.status in ('active', 'reopened')
  order by case when s.status = 'active' then 0 else 1 end, s.starts_at desc
  limit 1;

  if v_season_id is null then
    raise exception 'No hay una temporada activa. Administración debe abrirla antes de cargar exámenes.'
      using errcode = '55000';
  end if;

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
      raise exception 'El ejercicio % no tiene título.', v_ord
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
    admin_user_id, action, entity_type, entity_id, details
  ) values (
    auth.uid(),
    'trainer.exam_draft.upload',
    'ucapsa_exam',
    v_exam_id,
    jsonb_build_object(
      'season_id', v_season_id,
      'code', v_code,
      'title', v_title,
      'exam_date', p_exam_date,
      'items_count', jsonb_array_length(p_items)
    )
  );

  return v_exam_id;
end;
$$;

revoke all on function public.trainer_create_ucapsa_exam_draft(text,text,date,jsonb)
  from public, anon;
grant execute on function public.trainer_create_ucapsa_exam_draft(text,text,date,jsonb)
  to authenticated, service_role;

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
  v_ord bigint;
  v_member_number text;
  v_dog_name text;
  v_user_id uuid;
  v_dog_id uuid;
  v_match_count integer;
  v_errors jsonb;
  v_scores jsonb;
  v_scores_input jsonb;
  v_item record;
  v_raw jsonb;
  v_score numeric;
  v_extra_key text;
  v_rows_total integer := 0;
  v_rows_valid integer := 0;
  v_rows_invalid integer := 0;
  v_snapshot jsonb;
  v_import_row public.ucapsa_exam_import_rows%rowtype;
  v_attempt_id uuid;
  v_presented_at timestamptz;
  v_error_rows jsonb := '[]'::jsonb;
begin
  if not public.is_ucapsa_training_staff() then
    raise exception 'Solo staff de entrenamiento puede importar calificaciones.'
      using errcode = '42501';
  end if;

  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'El archivo debe contener al menos una fila de calificaciones.'
      using errcode = '22023';
  end if;

  select *
    into v_exam
  from public.ucapsa_exams
  where id = p_exam_id
  for update;

  if not found then raise exception 'Examen UCAPSA no encontrado.'; end if;
  if v_exam.status <> 'published' then
    raise exception 'Las calificaciones sólo pueden cargarse a un examen publicado.';
  end if;

  perform public.ucapsa_assert_competition_season_mutable(v_exam.season_id);

  v_snapshot := public.ucapsa_exam_import_snapshot(v_exam.id);
  if jsonb_array_length(v_snapshot) = 0 then
    raise exception 'El examen no tiene ejercicios configurados.';
  end if;

  insert into public.ucapsa_import_batches (
    season_id, exam_id, import_type, status, file_name, metadata, created_by
  ) values (
    v_exam.season_id,
    v_exam.id,
    'exam_results',
    'draft',
    nullif(btrim(coalesce(p_file_name, '')), ''),
    jsonb_build_object(
      'source', 'trainer_excel',
      'rows_total', 0,
      'rows_valid', 0,
      'rows_invalid', 0,
      'exam_snapshot', v_snapshot
    ),
    auth.uid()
  )
  returning id into v_batch_id;

  for v_row, v_ord in
    select value, ordinality
    from jsonb_array_elements(p_rows) with ordinality
  loop
    v_rows_total := v_rows_total + 1;
    v_errors := '[]'::jsonb;
    v_scores := '{}'::jsonb;
    v_member_number := nullif(btrim(v_row->>'member_number'), '');
    v_dog_name := nullif(btrim(v_row->>'dog_name'), '');
    v_scores_input := v_row->'scores';
    v_user_id := null;
    v_dog_id := null;
    v_match_count := 0;

    if v_member_number is null then
      v_errors := v_errors || jsonb_build_array(jsonb_build_object(
        'code', 'member_number_required',
        'message', 'Falta Identificador/member_number.'
      ));
    else
      select m.user_id
        into v_user_id
      from public.memberships m
      where m.member_number = v_member_number;

      if not found then
        v_errors := v_errors || jsonb_build_array(jsonb_build_object(
          'code', 'member_not_found',
          'message', 'No existe una membresía con ese Identificador.'
        ));
      end if;
    end if;

    if v_dog_name is null then
      v_errors := v_errors || jsonb_build_array(jsonb_build_object(
        'code', 'dog_name_required',
        'message', 'Falta el nombre del perro.'
      ));
    elsif v_user_id is not null then
      select count(*)
        into v_match_count
      from public.dogs d
      where d.user_id = v_user_id
        and lower(btrim(d.name)) = lower(v_dog_name);

      if v_match_count = 1 then
        select d.id
          into v_dog_id
        from public.dogs d
        where d.user_id = v_user_id
          and lower(btrim(d.name)) = lower(v_dog_name)
        limit 1;
      elsif v_match_count = 0 then
        v_errors := v_errors || jsonb_build_array(jsonb_build_object(
          'code', 'dog_not_found',
          'message', 'Ese perro no pertenece a la cuenta identificada.'
        ));
      else
        v_errors := v_errors || jsonb_build_array(jsonb_build_object(
          'code', 'dog_ambiguous',
          'message', 'Hay más de un perro con ese nombre en la cuenta.'
        ));
      end if;
    end if;

    if v_scores_input is null or jsonb_typeof(v_scores_input) <> 'object' then
      v_errors := v_errors || jsonb_build_array(jsonb_build_object(
        'code', 'scores_required',
        'message', 'Faltan las columnas de puntuación.'
      ));
      v_scores_input := '{}'::jsonb;
    end if;

    for v_item in
      select i.id, i.item_number, i.title, i.max_points
      from public.ucapsa_exam_items i
      where i.exam_id = v_exam.id
      order by i.item_number
    loop
      v_raw := v_scores_input -> v_item.item_number::text;

      if v_raw is null then
        v_errors := v_errors || jsonb_build_array(jsonb_build_object(
          'code', 'score_missing',
          'item_number', v_item.item_number,
          'title', v_item.title,
          'message', format('Falta puntuación para %s.', v_item.title)
        ));
      elsif jsonb_typeof(v_raw) <> 'number' then
        v_errors := v_errors || jsonb_build_array(jsonb_build_object(
          'code', 'score_not_numeric',
          'item_number', v_item.item_number,
          'title', v_item.title,
          'message', format('La puntuación de %s debe ser numérica.', v_item.title)
        ));
      else
        v_score := (v_raw #>> '{}')::numeric;
        if v_score < 0 or v_score > v_item.max_points then
          v_errors := v_errors || jsonb_build_array(jsonb_build_object(
            'code', 'score_out_of_range',
            'item_number', v_item.item_number,
            'title', v_item.title,
            'max_points', v_item.max_points,
            'received', v_score,
            'message', format('%s debe estar entre 0 y %s.', v_item.title, v_item.max_points)
          ));
        else
          v_scores := v_scores || jsonb_build_object(v_item.item_number::text, v_score);
        end if;
      end if;
    end loop;

    for v_extra_key in select jsonb_object_keys(v_scores_input)
    loop
      if not exists (
        select 1
        from public.ucapsa_exam_items i
        where i.exam_id = v_exam.id
          and i.item_number::text = v_extra_key
      ) then
        v_errors := v_errors || jsonb_build_array(jsonb_build_object(
          'code', 'unknown_score_column',
          'column', v_extra_key,
          'message', format('La columna %s no pertenece al examen.', v_extra_key)
        ));
      end if;
    end loop;

    insert into public.ucapsa_exam_import_rows (
      batch_id,
      row_number,
      member_number,
      dog_name,
      dog_id,
      raw_data,
      scores,
      validation_status,
      validation_errors
    ) values (
      v_batch_id,
      (v_ord::integer + 1),
      v_member_number,
      v_dog_name,
      v_dog_id,
      v_row,
      v_scores,
      case when jsonb_array_length(v_errors) = 0 then 'valid' else 'invalid' end,
      v_errors
    );
  end loop;

  update public.ucapsa_exam_import_rows r
  set validation_status = 'invalid',
      validation_errors = r.validation_errors || jsonb_build_array(jsonb_build_object(
        'code', 'duplicate_dog_in_batch',
        'message', 'El mismo perro aparece más de una vez en este archivo.'
      ))
  where r.batch_id = v_batch_id
    and r.dog_id is not null
    and exists (
      select 1
      from public.ucapsa_exam_import_rows x
      where x.batch_id = r.batch_id
        and x.dog_id = r.dog_id
        and x.id <> r.id
    );

  select
    count(*),
    count(*) filter (where validation_status = 'valid'),
    count(*) filter (where validation_status = 'invalid')
    into v_rows_total, v_rows_valid, v_rows_invalid
  from public.ucapsa_exam_import_rows
  where batch_id = v_batch_id;

  update public.ucapsa_import_batches
  set status = 'validated',
      metadata = metadata || jsonb_build_object(
        'rows_total', v_rows_total,
        'rows_valid', v_rows_valid,
        'rows_invalid', v_rows_invalid,
        'validated_at', clock_timestamp()
      )
  where id = v_batch_id;

  if v_rows_invalid > 0 then
    select coalesce(jsonb_agg(jsonb_build_object(
      'row_number', r.row_number,
      'member_number', r.member_number,
      'dog_name', r.dog_name,
      'errors', r.validation_errors
    ) order by r.row_number), '[]'::jsonb)
      into v_error_rows
    from public.ucapsa_exam_import_rows r
    where r.batch_id = v_batch_id
      and r.validation_status = 'invalid';

    insert into public.admin_audit_logs (
      admin_user_id, action, entity_type, entity_id, details
    ) values (
      auth.uid(),
      'trainer.exam_results.validate_failed',
      'ucapsa_import_batch',
      v_batch_id,
      jsonb_build_object(
        'rows_total', v_rows_total,
        'rows_valid', v_rows_valid,
        'rows_invalid', v_rows_invalid
      )
    );

    return jsonb_build_object(
      'batch_id', v_batch_id,
      'status', 'invalid',
      'rows_total', v_rows_total,
      'rows_valid', v_rows_valid,
      'rows_invalid', v_rows_invalid,
      'errors', v_error_rows
    );
  end if;

  v_presented_at := coalesce(
    v_exam.exam_date::timestamp at time zone 'America/Mexico_City',
    clock_timestamp()
  );

  for v_import_row in
    select *
    from public.ucapsa_exam_import_rows
    where batch_id = v_batch_id
      and validation_status = 'valid'
    order by row_number
  loop
    v_attempt_id := public.trainer_create_ucapsa_exam_attempt(
      v_exam.id,
      v_import_row.dog_id,
      v_presented_at
    );

    update public.ucapsa_exam_attempts
    set import_batch_id = v_batch_id
    where id = v_attempt_id;

    for v_item in
      select i.id, i.item_number
      from public.ucapsa_exam_items i
      where i.exam_id = v_exam.id
      order by i.item_number
    loop
      perform public.trainer_upsert_ucapsa_exam_item_result(
        v_attempt_id,
        v_item.id,
        (v_import_row.scores->>v_item.item_number::text)::numeric,
        null
      );
    end loop;

    perform public.trainer_review_ucapsa_exam_attempt(v_attempt_id);

    update public.ucapsa_exam_import_rows
    set attempt_id = v_attempt_id
    where id = v_import_row.id;
  end loop;

  update public.ucapsa_import_batches
  set status = 'committed',
      committed_at = clock_timestamp(),
      metadata = metadata || jsonb_build_object(
        'committed_rows', v_rows_valid,
        'committed_at', clock_timestamp(),
        'reviewed_by_trainer', true
      )
  where id = v_batch_id;

  insert into public.admin_audit_logs (
    admin_user_id, action, entity_type, entity_id, details
  ) values (
    auth.uid(),
    'trainer.exam_results.import',
    'ucapsa_import_batch',
    v_batch_id,
    jsonb_build_object(
      'exam_id', v_exam.id,
      'rows_total', v_rows_total,
      'reviewed_attempts', v_rows_valid,
      'file_name', nullif(btrim(coalesce(p_file_name, '')), '')
    )
  );

  return jsonb_build_object(
    'batch_id', v_batch_id,
    'status', 'reviewed',
    'rows_total', v_rows_total,
    'rows_valid', v_rows_valid,
    'rows_invalid', 0,
    'errors', '[]'::jsonb
  );
end;
$$;

revoke all on function public.trainer_import_ucapsa_exam_results(uuid,text,jsonb)
  from public, anon;
grant execute on function public.trainer_import_ucapsa_exam_results(uuid,text,jsonb)
  to authenticated, service_role;



create or replace function public.get_staff_exam_drafts()
returns table (
  exam_id uuid,
  exam_code text,
  exam_title text,
  exam_date date,
  items_count integer,
  created_by uuid,
  created_by_name text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $
begin
  if not public.is_ucapsa_training_staff() then
    raise exception 'Solo staff de entrenamiento puede consultar borradores de examen.'
      using errcode = '42501';
  end if;

  return query
  select
    e.id,
    e.code::text,
    e.title::text,
    e.exam_date,
    count(i.id)::integer,
    e.created_by,
    coalesce(p.full_name, p.email, 'Staff UCAPSA')::text,
    e.created_at
  from public.ucapsa_exams e
  join public.ucapsa_competition_seasons s on s.id = e.season_id
  left join public.ucapsa_exam_items i on i.exam_id = e.id
  left join public.profiles p on p.user_id = e.created_by
  where e.status = 'draft'
    and s.status in ('active', 'reopened')
  group by e.id, e.code, e.title, e.exam_date, e.created_by, p.full_name, p.email, e.created_at
  order by e.created_at desc;
end;
$;

revoke all on function public.get_staff_exam_drafts() from public, anon;
grant execute on function public.get_staff_exam_drafts() to authenticated, service_role;

comment on function public.trainer_create_ucapsa_exam_draft(text,text,date,jsonb) is
  'Carga un examen como borrador dentro de la temporada activa. Administración conserva la publicación y configuración competitiva.';
comment on function public.trainer_import_ucapsa_exam_results(uuid,text,jsonb) is
  'Valida e importa calificaciones desde Excel y deja los intentos en reviewed; nunca publica ni vuelve resultados oficiales.';
