-- UCAPSA Rango 1 — hardening de resolución de perro en importaciones de examen
-- PostgreSQL no implementa min(uuid). Contamos coincidencias y sólo cuando hay
-- exactamente una resolvemos el id explícitamente.

create or replace function public.admin_validate_ucapsa_exam_import_batch(
  p_batch_id uuid,
  p_rows jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_batch public.ucapsa_import_batches%rowtype;
  v_exam public.ucapsa_exams%rowtype;
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
begin
  if not public.is_ucapsa_admin() then
    raise exception 'Solo Admin puede validar importaciones UCAPSA.';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows)=0 then
    raise exception 'La importacion debe contener al menos una fila.';
  end if;

  select * into v_batch
  from public.ucapsa_import_batches
  where id=p_batch_id
  for update;

  if not found or v_batch.import_type <> 'exam_results' then
    raise exception 'Lote de resultados de examen no encontrado.';
  end if;
  if v_batch.status not in ('draft','validated') then
    raise exception 'Solo un lote draft/validated puede volver a validarse.';
  end if;

  select * into v_exam
  from public.ucapsa_exams
  where id=v_batch.exam_id;

  if not found or v_exam.status <> 'published' then
    raise exception 'El examen del lote debe estar publicado.';
  end if;
  perform public.ucapsa_assert_competition_season_mutable(v_batch.season_id);

  v_snapshot := public.ucapsa_exam_import_snapshot(v_batch.exam_id);
  if jsonb_array_length(v_snapshot)=0 then
    raise exception 'El examen no tiene ejercicios configurados.';
  end if;

  delete from public.ucapsa_exam_import_rows where batch_id=p_batch_id;

  for v_row, v_ord in
    select value, ordinality
    from jsonb_array_elements(p_rows) with ordinality
  loop
    v_rows_total := v_rows_total + 1;
    v_errors := '[]'::jsonb;
    v_scores := '{}'::jsonb;
    v_member_number := nullif(btrim(v_row->>'member_number'),'');
    v_dog_name := nullif(btrim(v_row->>'dog_name'),'');
    v_scores_input := v_row->'scores';
    v_user_id := null;
    v_dog_id := null;
    v_match_count := 0;

    if v_member_number is null then
      v_errors := v_errors || jsonb_build_array(jsonb_build_object(
        'code','member_number_required','message','Falta Identificador/member_number.'
      ));
    else
      select m.user_id into v_user_id
      from public.memberships m
      where m.member_number = v_member_number;

      if not found then
        v_errors := v_errors || jsonb_build_array(jsonb_build_object(
          'code','member_not_found','message','No existe una membresia con ese Identificador.'
        ));
      end if;
    end if;

    if v_dog_name is null then
      v_errors := v_errors || jsonb_build_array(jsonb_build_object(
        'code','dog_name_required','message','Falta el nombre del perro.'
      ));
    elsif v_user_id is not null then
      select count(*) into v_match_count
      from public.dogs d
      where d.user_id=v_user_id
        and lower(btrim(d.name))=lower(v_dog_name);

      if v_match_count=1 then
        select d.id into v_dog_id
        from public.dogs d
        where d.user_id=v_user_id
          and lower(btrim(d.name))=lower(v_dog_name)
        limit 1;
      elsif v_match_count=0 then
        v_errors := v_errors || jsonb_build_array(jsonb_build_object(
          'code','dog_not_found','message','Ese perro no pertenece a la cuenta identificada.'
        ));
      else
        v_errors := v_errors || jsonb_build_array(jsonb_build_object(
          'code','dog_ambiguous','message','Hay mas de un perro con ese nombre en la cuenta.'
        ));
      end if;
    end if;

    if v_scores_input is null or jsonb_typeof(v_scores_input) <> 'object' then
      v_errors := v_errors || jsonb_build_array(jsonb_build_object(
        'code','scores_required','message','Faltan las columnas de puntuacion.'
      ));
      v_scores_input := '{}'::jsonb;
    end if;

    for v_item in
      select i.id, i.item_number, i.title, i.max_points
      from public.ucapsa_exam_items i
      where i.exam_id=v_batch.exam_id
      order by i.item_number
    loop
      v_raw := v_scores_input -> v_item.item_number::text;

      if v_raw is null then
        v_errors := v_errors || jsonb_build_array(jsonb_build_object(
          'code','score_missing','item_number',v_item.item_number,'title',v_item.title,
          'message',format('Falta puntuacion para %s.',v_item.title)
        ));
      elsif jsonb_typeof(v_raw) <> 'number' then
        v_errors := v_errors || jsonb_build_array(jsonb_build_object(
          'code','score_not_numeric','item_number',v_item.item_number,'title',v_item.title,
          'message',format('La puntuacion de %s debe ser numerica.',v_item.title)
        ));
      else
        v_score := (v_raw #>> '{}')::numeric;
        if v_score < 0 or v_score > v_item.max_points then
          v_errors := v_errors || jsonb_build_array(jsonb_build_object(
            'code','score_out_of_range','item_number',v_item.item_number,'title',v_item.title,
            'max_points',v_item.max_points,'received',v_score,
            'message',format('%s debe estar entre 0 y %s.',v_item.title,v_item.max_points)
          ));
        else
          v_scores := v_scores || jsonb_build_object(v_item.item_number::text,v_score);
        end if;
      end if;
    end loop;

    for v_extra_key in select jsonb_object_keys(v_scores_input)
    loop
      if not exists (
        select 1
        from public.ucapsa_exam_items i
        where i.exam_id=v_batch.exam_id
          and i.item_number::text=v_extra_key
      ) then
        v_errors := v_errors || jsonb_build_array(jsonb_build_object(
          'code','unknown_score_column','column',v_extra_key,
          'message',format('La columna %s no pertenece al examen.',v_extra_key)
        ));
      end if;
    end loop;

    insert into public.ucapsa_exam_import_rows (
      batch_id,row_number,member_number,dog_name,dog_id,raw_data,scores,
      validation_status,validation_errors
    ) values (
      p_batch_id,(v_ord::integer+1),v_member_number,v_dog_name,v_dog_id,v_row,v_scores,
      case when jsonb_array_length(v_errors)=0 then 'valid' else 'invalid' end,
      v_errors
    );
  end loop;

  update public.ucapsa_exam_import_rows r
  set validation_status='invalid',
      validation_errors=r.validation_errors || jsonb_build_array(jsonb_build_object(
        'code','duplicate_dog_in_batch','message','El mismo perro aparece mas de una vez en este archivo.'
      ))
  where r.batch_id=p_batch_id
    and r.dog_id is not null
    and exists (
      select 1
      from public.ucapsa_exam_import_rows x
      where x.batch_id=r.batch_id
        and x.dog_id=r.dog_id
        and x.id<>r.id
    );

  select count(*),
         count(*) filter (where validation_status='valid'),
         count(*) filter (where validation_status='invalid')
    into v_rows_total,v_rows_valid,v_rows_invalid
  from public.ucapsa_exam_import_rows
  where batch_id=p_batch_id;

  update public.ucapsa_import_batches
  set status='validated',
      metadata=metadata || jsonb_build_object(
        'exam_snapshot',v_snapshot,
        'rows_total',v_rows_total,
        'rows_valid',v_rows_valid,
        'rows_invalid',v_rows_invalid,
        'validated_at',now()
      )
  where id=p_batch_id;

  perform public.ucapsa_exam_admin_audit(
    'ucapsa_exam_import.validate','ucapsa_import_batch',p_batch_id,
    jsonb_build_object(
      'rows_total',v_rows_total,
      'rows_valid',v_rows_valid,
      'rows_invalid',v_rows_invalid
    )
  );

  return p_batch_id;
end;
$$;

revoke all on function public.admin_validate_ucapsa_exam_import_batch(uuid,jsonb)
  from public, anon, authenticated;
grant execute on function public.admin_validate_ucapsa_exam_import_batch(uuid,jsonb)
  to authenticated;
