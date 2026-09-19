-- UCAPSA Rango 1 — importación Excel de Exámenes
--
-- Backend canónico después de que la UI parsea el archivo .xlsx/.csv.
-- El archivo no escribe tablas finales: se valida/stagea, se previsualiza y sólo
-- al confirmar se crean intentos/resultados canónicos usando los mismos RPCs Admin.
--
-- Identidad de fila: member_number (cuenta) + dog_name (perro de esa cuenta).
-- Los máximos vienen de ucapsa_exam_items. No existe total editable.

create table if not exists public.ucapsa_exam_import_rows (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.ucapsa_import_batches(id) on delete cascade,
  row_number integer not null check (row_number > 0),
  member_number text,
  dog_name text,
  dog_id uuid references public.dogs(id) on delete restrict,
  raw_data jsonb not null default '{}'::jsonb,
  scores jsonb not null default '{}'::jsonb check (jsonb_typeof(scores) = 'object'),
  validation_status text not null default 'invalid'
    check (validation_status in ('valid','invalid')),
  validation_errors jsonb not null default '[]'::jsonb
    check (jsonb_typeof(validation_errors) = 'array'),
  attempt_id uuid references public.ucapsa_exam_attempts(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (batch_id, row_number)
);

create index if not exists ucapsa_exam_import_rows_batch_idx
  on public.ucapsa_exam_import_rows(batch_id, row_number);
create index if not exists ucapsa_exam_import_rows_dog_idx
  on public.ucapsa_exam_import_rows(dog_id)
  where dog_id is not null;
create index if not exists ucapsa_exam_import_rows_attempt_idx
  on public.ucapsa_exam_import_rows(attempt_id)
  where attempt_id is not null;

alter table public.ucapsa_exam_import_rows enable row level security;
revoke all on table public.ucapsa_exam_import_rows from public, anon, authenticated;
grant select on table public.ucapsa_exam_import_rows to authenticated;
grant all on table public.ucapsa_exam_import_rows to service_role;

drop policy if exists "Admins read exam import rows" on public.ucapsa_exam_import_rows;
create policy "Admins read exam import rows"
on public.ucapsa_exam_import_rows
for select
to authenticated
using ((select public.is_ucapsa_admin()));

drop trigger if exists trg_ucapsa_exam_import_rows_updated_at on public.ucapsa_exam_import_rows;
create trigger trg_ucapsa_exam_import_rows_updated_at
before update on public.ucapsa_exam_import_rows
for each row execute function public.ucapsa_rango_touch_updated_at();

create or replace function public.ucapsa_guard_exam_import_row_state()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_batch_id uuid;
  v_status text;
  v_season_id uuid;
begin
  v_batch_id := case when tg_op = 'DELETE' then old.batch_id else new.batch_id end;

  select b.status, b.season_id into v_status, v_season_id
  from public.ucapsa_import_batches b
  where b.id = v_batch_id;

  if not found then raise exception 'Lote de importacion UCAPSA no encontrado.'; end if;
  perform public.ucapsa_assert_competition_season_mutable(v_season_id);

  if v_status not in ('draft','validated') then
    raise exception 'Las filas de un lote % ya no pueden modificarse.', v_status
      using errcode = '55000';
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke all on function public.ucapsa_guard_exam_import_row_state()
  from public, anon, authenticated;

drop trigger if exists trg_ucapsa_guard_exam_import_row_state
  on public.ucapsa_exam_import_rows;
create trigger trg_ucapsa_guard_exam_import_row_state
before insert or update or delete on public.ucapsa_exam_import_rows
for each row execute function public.ucapsa_guard_exam_import_row_state();

create or replace function public.ucapsa_guard_exam_import_batch_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.import_type <> 'exam_results' then return new; end if;

  if tg_op = 'INSERT' then
    if new.status <> 'draft' then
      raise exception 'Un lote de examen nuevo debe iniciar en draft.' using errcode='55000';
    end if;
    return new;
  end if;

  if new.status = old.status then return new; end if;

  if (old.status='draft' and new.status='validated')
    or (old.status='validated' and new.status='committed')
    or (old.status='committed' and new.status='reverted') then
    return new;
  end if;

  raise exception 'Transicion de lote de examen invalida: % -> %', old.status, new.status
    using errcode='55000';
end;
$$;

revoke all on function public.ucapsa_guard_exam_import_batch_lifecycle()
  from public, anon, authenticated;

drop trigger if exists trg_ucapsa_guard_exam_import_batch_lifecycle
  on public.ucapsa_import_batches;
create trigger trg_ucapsa_guard_exam_import_batch_lifecycle
before insert or update on public.ucapsa_import_batches
for each row execute function public.ucapsa_guard_exam_import_batch_lifecycle();

create or replace function public.ucapsa_exam_import_snapshot(p_exam_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', i.id,
        'item_number', i.item_number,
        'title', i.title,
        'max_points', i.max_points,
        'sort_order', i.sort_order
      ) order by i.item_number, i.id
    ),
    '[]'::jsonb
  )
  from public.ucapsa_exam_items i
  where i.exam_id = p_exam_id;
$$;

revoke all on function public.ucapsa_exam_import_snapshot(uuid)
  from public, anon, authenticated;

create or replace function public.admin_create_ucapsa_exam_import_batch(
  p_exam_id uuid,
  p_file_name text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_exam public.ucapsa_exams%rowtype;
  v_id uuid;
begin
  if not public.is_ucapsa_admin() then raise exception 'Solo Admin puede importar resultados UCAPSA.'; end if;

  select * into v_exam from public.ucapsa_exams where id = p_exam_id for update;
  if not found then raise exception 'Examen UCAPSA no encontrado.'; end if;
  if v_exam.status <> 'published' then raise exception 'Solo se pueden importar resultados a un examen publicado.'; end if;
  perform public.ucapsa_assert_competition_season_mutable(v_exam.season_id);

  insert into public.ucapsa_import_batches (
    season_id, exam_id, import_type, status, file_name, metadata, created_by
  ) values (
    v_exam.season_id,p_exam_id,'exam_results','draft',nullif(btrim(p_file_name),''),
    jsonb_build_object('source','excel','rows_total',0,'rows_valid',0,'rows_invalid',0),auth.uid()
  ) returning id into v_id;

  perform public.ucapsa_exam_admin_audit(
    'ucapsa_exam_import.create','ucapsa_import_batch',v_id,
    jsonb_build_object('exam_id',p_exam_id,'file_name',nullif(btrim(p_file_name),''))
  );
  return v_id;
end;
$$;

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
  if not public.is_ucapsa_admin() then raise exception 'Solo Admin puede validar importaciones UCAPSA.'; end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows)=0 then
    raise exception 'La importacion debe contener al menos una fila.';
  end if;

  select * into v_batch from public.ucapsa_import_batches where id=p_batch_id for update;
  if not found or v_batch.import_type <> 'exam_results' then raise exception 'Lote de resultados de examen no encontrado.'; end if;
  if v_batch.status not in ('draft','validated') then raise exception 'Solo un lote draft/validated puede volver a validarse.'; end if;

  select * into v_exam from public.ucapsa_exams where id=v_batch.exam_id;
  if not found or v_exam.status <> 'published' then raise exception 'El examen del lote debe estar publicado.'; end if;
  perform public.ucapsa_assert_competition_season_mutable(v_batch.season_id);

  v_snapshot := public.ucapsa_exam_import_snapshot(v_batch.exam_id);
  if jsonb_array_length(v_snapshot)=0 then raise exception 'El examen no tiene ejercicios configurados.'; end if;

  delete from public.ucapsa_exam_import_rows where batch_id=p_batch_id;

  for v_row, v_ord in
    select value, ordinality from jsonb_array_elements(p_rows) with ordinality
  loop
    v_rows_total := v_rows_total + 1;
    v_errors := '[]'::jsonb;
    v_scores := '{}'::jsonb;
    v_member_number := nullif(btrim(v_row->>'member_number'),'');
    v_dog_name := nullif(btrim(v_row->>'dog_name'),'');
    v_scores_input := v_row->'scores';
    v_user_id := null;
    v_dog_id := null;

    if v_member_number is null then
      v_errors := v_errors || jsonb_build_array(jsonb_build_object('code','member_number_required','message','Falta Identificador/member_number.'));
    else
      select m.user_id into v_user_id from public.memberships m where m.member_number = v_member_number;
      if not found then
        v_errors := v_errors || jsonb_build_array(jsonb_build_object('code','member_not_found','message','No existe una membresia con ese Identificador.'));
      end if;
    end if;

    if v_dog_name is null then
      v_errors := v_errors || jsonb_build_array(jsonb_build_object('code','dog_name_required','message','Falta el nombre del perro.'));
    elsif v_user_id is not null then
      select count(*), min(d.id) into v_match_count, v_dog_id
      from public.dogs d
      where d.user_id=v_user_id and lower(btrim(d.name))=lower(v_dog_name);

      if v_match_count=0 then
        v_dog_id := null;
        v_errors := v_errors || jsonb_build_array(jsonb_build_object('code','dog_not_found','message','Ese perro no pertenece a la cuenta identificada.'));
      elsif v_match_count>1 then
        v_dog_id := null;
        v_errors := v_errors || jsonb_build_array(jsonb_build_object('code','dog_ambiguous','message','Hay mas de un perro con ese nombre en la cuenta.'));
      end if;
    end if;

    if v_scores_input is null or jsonb_typeof(v_scores_input) <> 'object' then
      v_errors := v_errors || jsonb_build_array(jsonb_build_object('code','scores_required','message','Faltan las columnas de puntuacion.'));
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
        select 1 from public.ucapsa_exam_items i
        where i.exam_id=v_batch.exam_id and i.item_number::text=v_extra_key
      ) then
        v_errors := v_errors || jsonb_build_array(jsonb_build_object(
          'code','unknown_score_column','column',v_extra_key,
          'message',format('La columna %s no pertenece al examen.',v_extra_key)
        ));
      end if;
    end loop;

    insert into public.ucapsa_exam_import_rows (
      batch_id,row_number,member_number,dog_name,dog_id,raw_data,scores,validation_status,validation_errors
    ) values (
      p_batch_id,(v_ord::integer+1),v_member_number,v_dog_name,v_dog_id,v_row,v_scores,
      case when jsonb_array_length(v_errors)=0 then 'valid' else 'invalid' end,v_errors
    );
  end loop;

  update public.ucapsa_exam_import_rows r
  set validation_status='invalid',
      validation_errors=r.validation_errors || jsonb_build_array(jsonb_build_object(
        'code','duplicate_dog_in_batch','message','El mismo perro aparece mas de una vez en este archivo.'
      ))
  where r.batch_id=p_batch_id and r.dog_id is not null
    and exists (
      select 1 from public.ucapsa_exam_import_rows x
      where x.batch_id=r.batch_id and x.dog_id=r.dog_id and x.id<>r.id
    );

  select count(*),count(*) filter (where validation_status='valid'),count(*) filter (where validation_status='invalid')
    into v_rows_total,v_rows_valid,v_rows_invalid
  from public.ucapsa_exam_import_rows where batch_id=p_batch_id;

  update public.ucapsa_import_batches
  set status='validated',
      metadata=metadata || jsonb_build_object(
        'exam_snapshot',v_snapshot,'rows_total',v_rows_total,'rows_valid',v_rows_valid,
        'rows_invalid',v_rows_invalid,'validated_at',now()
      )
  where id=p_batch_id;

  perform public.ucapsa_exam_admin_audit(
    'ucapsa_exam_import.validate','ucapsa_import_batch',p_batch_id,
    jsonb_build_object('rows_total',v_rows_total,'rows_valid',v_rows_valid,'rows_invalid',v_rows_invalid)
  );
  return p_batch_id;
end;
$$;

create or replace view public.ucapsa_exam_import_preview
with (security_invoker=true)
as
select
  b.id as batch_id,b.season_id,b.exam_id,b.file_name,b.status as batch_status,
  r.id as import_row_id,r.row_number,r.member_number,r.dog_name,r.dog_id,
  d.name as resolved_dog_name,r.validation_status,r.validation_errors,r.scores,r.attempt_id,
  coalesce((
    select sum((r.scores ->> i.item_number::text)::numeric)
    from public.ucapsa_exam_items i
    where i.exam_id=b.exam_id and r.scores ? i.item_number::text
  ),0::numeric) as total_points_awarded,
  coalesce((select sum(i.max_points) from public.ucapsa_exam_items i where i.exam_id=b.exam_id),0::numeric) as max_points
from public.ucapsa_import_batches b
join public.ucapsa_exam_import_rows r on r.batch_id=b.id
left join public.dogs d on d.id=r.dog_id
where b.import_type='exam_results';

revoke all on table public.ucapsa_exam_import_preview from public, anon, authenticated;
grant select on table public.ucapsa_exam_import_preview to authenticated;
grant select on table public.ucapsa_exam_import_preview to service_role;

create or replace function public.admin_commit_ucapsa_exam_import_batch(p_batch_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_batch public.ucapsa_import_batches%rowtype;
  v_exam public.ucapsa_exams%rowtype;
  v_row public.ucapsa_exam_import_rows%rowtype;
  v_item record;
  v_attempt_id uuid;
  v_valid_count integer;
  v_snapshot jsonb;
  v_presented_at timestamptz;
begin
  if not public.is_ucapsa_admin() then raise exception 'Solo Admin puede confirmar importaciones UCAPSA.'; end if;
  select * into v_batch from public.ucapsa_import_batches where id=p_batch_id for update;
  if not found or v_batch.import_type<>'exam_results' then raise exception 'Lote de examen no encontrado.'; end if;
  if v_batch.status<>'validated' then raise exception 'El lote debe estar validado antes de confirmar.'; end if;
  perform public.ucapsa_assert_competition_season_mutable(v_batch.season_id);

  select * into v_exam from public.ucapsa_exams where id=v_batch.exam_id;
  if not found or v_exam.status<>'published' then raise exception 'El examen del lote debe estar publicado.'; end if;

  v_snapshot := public.ucapsa_exam_import_snapshot(v_batch.exam_id);
  if v_snapshot is distinct from (v_batch.metadata->'exam_snapshot') then
    raise exception 'La estructura del examen cambio despues de validar. Vuelve a validar el archivo.' using errcode='55000';
  end if;

  select count(*) into v_valid_count
  from public.ucapsa_exam_import_rows where batch_id=p_batch_id and validation_status='valid';
  if v_valid_count=0 then raise exception 'No hay filas validas que confirmar.'; end if;
  if exists (
    select 1 from public.ucapsa_exam_import_rows
    where batch_id=p_batch_id and validation_status='valid' and attempt_id is not null
  ) then raise exception 'El lote ya contiene intentos confirmados.'; end if;

  v_presented_at := coalesce(v_exam.exam_date::timestamp at time zone 'America/Mexico_City',now());

  for v_row in
    select * from public.ucapsa_exam_import_rows
    where batch_id=p_batch_id and validation_status='valid'
    order by row_number
  loop
    v_attempt_id := public.admin_create_ucapsa_exam_attempt(v_batch.exam_id,v_row.dog_id,v_presented_at);
    update public.ucapsa_exam_attempts set import_batch_id=p_batch_id where id=v_attempt_id;

    for v_item in
      select i.id,i.item_number from public.ucapsa_exam_items i
      where i.exam_id=v_batch.exam_id order by i.item_number
    loop
      perform public.admin_upsert_ucapsa_exam_item_result(
        v_attempt_id,v_item.id,(v_row.scores->>v_item.item_number::text)::numeric,null
      );
    end loop;

    update public.ucapsa_exam_import_rows set attempt_id=v_attempt_id where id=v_row.id;
  end loop;

  update public.ucapsa_import_batches
  set status='committed',committed_at=now(),
      metadata=metadata || jsonb_build_object('committed_rows',v_valid_count,'committed_at',now())
  where id=p_batch_id;

  perform public.ucapsa_exam_admin_audit(
    'ucapsa_exam_import.commit','ucapsa_import_batch',p_batch_id,jsonb_build_object('committed_rows',v_valid_count)
  );
  return p_batch_id;
end;
$$;

create or replace function public.admin_review_ucapsa_exam_import_batch(p_batch_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_batch public.ucapsa_import_batches%rowtype;
  v_attempt record;
  v_count integer := 0;
begin
  if not public.is_ucapsa_admin() then raise exception 'Solo Admin puede revisar importaciones UCAPSA.'; end if;
  select * into v_batch from public.ucapsa_import_batches where id=p_batch_id for update;
  if not found or v_batch.import_type<>'exam_results' then raise exception 'Lote no encontrado.'; end if;
  if v_batch.status<>'committed' then raise exception 'El lote debe estar committed para revisarse.'; end if;
  perform public.ucapsa_assert_competition_season_mutable(v_batch.season_id);

  for v_attempt in
    select a.id,a.status from public.ucapsa_exam_attempts a
    where a.import_batch_id=p_batch_id order by a.created_at,a.id
  loop
    if v_attempt.status='draft' then
      perform public.admin_review_ucapsa_exam_attempt(v_attempt.id);
      v_count := v_count+1;
    elsif v_attempt.status not in ('reviewed','published') then
      raise exception 'El intento % esta en estado % y no puede revisarse en lote.',v_attempt.id,v_attempt.status;
    end if;
  end loop;

  perform public.ucapsa_exam_admin_audit(
    'ucapsa_exam_import.review','ucapsa_import_batch',p_batch_id,jsonb_build_object('reviewed_now',v_count)
  );
  return p_batch_id;
end;
$$;

create or replace function public.admin_publish_ucapsa_exam_import_batch(
  p_batch_id uuid,
  p_make_official boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_batch public.ucapsa_import_batches%rowtype;
  v_attempt record;
  v_count integer := 0;
begin
  if not public.is_ucapsa_admin() then raise exception 'Solo Admin puede publicar importaciones UCAPSA.'; end if;
  select * into v_batch from public.ucapsa_import_batches where id=p_batch_id for update;
  if not found or v_batch.import_type<>'exam_results' then raise exception 'Lote no encontrado.'; end if;
  if v_batch.status<>'committed' then raise exception 'El lote debe estar committed para publicarse.'; end if;
  perform public.ucapsa_assert_competition_season_mutable(v_batch.season_id);

  if exists (
    select 1 from public.ucapsa_exam_attempts a
    where a.import_batch_id=p_batch_id and a.status not in ('reviewed','published')
  ) then raise exception 'Todos los intentos del lote deben estar reviewed antes de publicar.'; end if;

  for v_attempt in
    select a.id from public.ucapsa_exam_attempts a
    where a.import_batch_id=p_batch_id order by a.created_at,a.id
  loop
    perform public.admin_publish_ucapsa_exam_attempt(v_attempt.id,coalesce(p_make_official,true));
    v_count := v_count+1;
  end loop;

  perform public.ucapsa_exam_admin_audit(
    'ucapsa_exam_import.publish','ucapsa_import_batch',p_batch_id,
    jsonb_build_object('published_attempts',v_count,'make_official',coalesce(p_make_official,true))
  );
  return p_batch_id;
end;
$$;

create or replace function public.admin_revert_ucapsa_exam_import_batch(p_batch_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_batch public.ucapsa_import_batches%rowtype;
  v_attempt record;
  v_voided_count integer := 0;
begin
  if not public.is_ucapsa_admin() then
    raise exception 'Solo Admin puede revertir importaciones UCAPSA.';
  end if;

  select * into v_batch
  from public.ucapsa_import_batches
  where id=p_batch_id
  for update;

  if not found or v_batch.import_type<>'exam_results' then
    raise exception 'Lote no encontrado.';
  end if;
  if v_batch.status<>'committed' then
    raise exception 'Solo un lote committed puede revertirse.';
  end if;

  perform public.ucapsa_assert_competition_season_mutable(v_batch.season_id);

  if exists (
    select 1
    from public.ucapsa_exam_attempts a
    where a.import_batch_id=p_batch_id
      and (a.status='published' or a.is_official=true)
  ) then
    raise exception 'Un lote con resultados publicados no puede revertirse. Anula/corrige los intentos publicados.'
      using errcode='55000';
  end if;

  for v_attempt in
    select a.id,a.status
    from public.ucapsa_exam_attempts a
    where a.import_batch_id=p_batch_id
    order by a.created_at,a.id
  loop
    if v_attempt.status <> 'voided' then
      perform public.admin_void_ucapsa_exam_attempt(v_attempt.id);
      v_voided_count := v_voided_count + 1;
    end if;
  end loop;

  update public.ucapsa_import_batches
  set status='reverted',
      reverted_at=now(),
      metadata=metadata || jsonb_build_object(
        'reverted_at',now(),
        'voided_attempts',v_voided_count
      )
  where id=p_batch_id;

  perform public.ucapsa_exam_admin_audit(
    'ucapsa_exam_import.revert','ucapsa_import_batch',p_batch_id,
    jsonb_build_object('voided_attempts',v_voided_count)
  );

  return p_batch_id;
end;
$$;

revoke all on function public.admin_create_ucapsa_exam_import_batch(uuid,text) from public, anon, authenticated;
revoke all on function public.admin_validate_ucapsa_exam_import_batch(uuid,jsonb) from public, anon, authenticated;
revoke all on function public.admin_commit_ucapsa_exam_import_batch(uuid) from public, anon, authenticated;
revoke all on function public.admin_review_ucapsa_exam_import_batch(uuid) from public, anon, authenticated;
revoke all on function public.admin_publish_ucapsa_exam_import_batch(uuid,boolean) from public, anon, authenticated;
revoke all on function public.admin_revert_ucapsa_exam_import_batch(uuid) from public, anon, authenticated;

grant execute on function public.admin_create_ucapsa_exam_import_batch(uuid,text) to authenticated;
grant execute on function public.admin_validate_ucapsa_exam_import_batch(uuid,jsonb) to authenticated;
grant execute on function public.admin_commit_ucapsa_exam_import_batch(uuid) to authenticated;
grant execute on function public.admin_review_ucapsa_exam_import_batch(uuid) to authenticated;
grant execute on function public.admin_publish_ucapsa_exam_import_batch(uuid,boolean) to authenticated;
grant execute on function public.admin_revert_ucapsa_exam_import_batch(uuid) to authenticated;
