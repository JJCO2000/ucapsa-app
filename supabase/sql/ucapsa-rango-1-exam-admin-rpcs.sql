-- UCAPSA Rango 1 — capa operativa Admin de Exámenes
--
-- La UI futura NO escribe directamente las tablas canónicas. Estas RPCs son el
-- único contrato operativo para crear/configurar exámenes, capturar resultados,
-- revisar/publicar intentos y seleccionar el intento oficial.
--
-- No define pesos, escala, Rango ni Ranking.

-- -----------------------------------------------------------------------------
-- Auditoría interna común.
-- -----------------------------------------------------------------------------

create or replace function public.ucapsa_exam_admin_audit(
  p_action text,
  p_entity_type text,
  p_entity_id uuid,
  p_details jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_ucapsa_admin() then
    raise exception 'Solo Admin puede operar Examenes UCAPSA.';
  end if;

  insert into public.admin_audit_logs (
    admin_user_id, action, entity_type, entity_id, details
  ) values (
    auth.uid(), p_action, p_entity_type, p_entity_id, coalesce(p_details, '{}'::jsonb)
  );
end;
$$;

revoke all on function public.ucapsa_exam_admin_audit(text,text,uuid,jsonb)
  from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Refuerzo de integridad: un examen sólo puede publicarse si su temporada ya es
-- active/reopened. Una temporada draft puede preparar examen/items, no exponerlo.
-- -----------------------------------------------------------------------------

create or replace function public.ucapsa_guard_exam_status_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_items_count bigint;
  v_season_status text;
begin
  if tg_op = 'INSERT' then
    if new.status <> 'draft' then
      raise exception 'Un examen UCAPSA nuevo debe iniciar en borrador.'
        using errcode = '55000';
    end if;
    return new;
  end if;

  if new.status = old.status then
    return new;
  end if;

  if old.status = 'draft' and new.status = 'published' then
    select s.status into v_season_status
    from public.ucapsa_competition_seasons s
    where s.id = new.season_id;

    if v_season_status not in ('active', 'reopened') then
      raise exception 'El examen sólo puede publicarse cuando la temporada está activa o reabierta.'
        using errcode = '55000';
    end if;

    select count(*) into v_items_count
    from public.ucapsa_exam_items i
    where i.exam_id = old.id;

    if v_items_count = 0 then
      raise exception 'No se puede publicar un examen UCAPSA sin ejercicios.'
        using errcode = '55000';
    end if;
    return new;
  end if;

  if (old.status = 'draft' and new.status = 'archived')
    or (old.status = 'published' and new.status = 'archived') then
    return new;
  end if;

  raise exception 'Transicion de examen UCAPSA invalida: % -> %', old.status, new.status
    using errcode = '55000';
end;
$$;

revoke all on function public.ucapsa_guard_exam_status_lifecycle()
  from public, anon, authenticated;

-- Un estado reviewed significa que el intento ya pasó validación de completitud.
create or replace function public.ucapsa_guard_exam_attempt_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_items_count bigint;
  v_results_count bigint;
begin
  if tg_op = 'INSERT' then
    if new.status <> 'draft' then
      raise exception 'Un intento de examen UCAPSA nuevo debe iniciar en borrador.'
        using errcode = '55000';
    end if;
    return new;
  end if;

  if new.status = old.status then
    return new;
  end if;

  if old.status = 'draft' and new.status = 'reviewed' then
    select count(*) into v_items_count
    from public.ucapsa_exam_items i
    where i.exam_id = new.exam_id;

    select count(*) into v_results_count
    from public.ucapsa_exam_item_results r
    join public.ucapsa_exam_items i on i.id = r.exam_item_id
    where r.attempt_id = new.id
      and i.exam_id = new.exam_id;

    if v_items_count = 0 or v_results_count <> v_items_count then
      raise exception 'No se puede revisar un intento incompleto: % de % ejercicios calificados.', v_results_count, v_items_count
        using errcode = '55000';
    end if;
    return new;
  end if;

  if (old.status = 'reviewed' and new.status = 'published')
    or (old.status in ('draft', 'reviewed', 'published') and new.status = 'voided') then
    return new;
  end if;

  raise exception 'Transicion de intento UCAPSA invalida: % -> %', old.status, new.status
    using errcode = '55000';
end;
$$;

revoke all on function public.ucapsa_guard_exam_attempt_lifecycle()
  from public, anon, authenticated;

-- Reviewed y published ya tienen forma completa: pueden corregir puntuación/nota,
-- pero no perder/reasignar filas de ejercicios.
create or replace function public.ucapsa_guard_published_exam_result_shape()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
begin
  select a.status into v_status
  from public.ucapsa_exam_attempts a
  where a.id = old.attempt_id;

  if v_status in ('reviewed', 'published', 'voided') then
    raise exception 'No se puede eliminar o reasignar un ejercicio de un resultado revisado/publicado. Corrige su puntuacion o anula el intento.'
      using errcode = '55000';
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke all on function public.ucapsa_guard_published_exam_result_shape()
  from public, anon, authenticated;

-- La estructura queda congelada desde que existe un intento reviewed/published.
-- Con intentos draft, max_points tampoco puede bajar por debajo de un valor ya
-- capturado y un item con resultados no puede moverse a otro examen.
create or replace function public.ucapsa_guard_exam_item_structure_after_publish()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_exam_id uuid;
  v_exam_status text;
  v_season_id uuid;
  v_target_exam_status text;
  v_target_season_id uuid;
  v_has_locked_attempt boolean;
  v_has_results boolean;
  v_max_awarded numeric;
begin
  if tg_op = 'INSERT' then
    v_exam_id := new.exam_id;
  else
    v_exam_id := old.exam_id;
  end if;

  select e.status, e.season_id
    into v_exam_status, v_season_id
  from public.ucapsa_exams e
  where e.id = v_exam_id;

  if not found then
    raise exception 'Examen UCAPSA no encontrado.'
      using errcode = '55000';
  end if;

  perform public.ucapsa_assert_competition_season_mutable(v_season_id);

  if v_exam_status is distinct from 'draft' then
    raise exception 'La estructura de un examen publicado o archivado no puede modificarse.'
      using errcode = '55000';
  end if;

  if tg_op = 'UPDATE' and new.exam_id is distinct from old.exam_id then
    select e.status, e.season_id
      into v_target_exam_status, v_target_season_id
    from public.ucapsa_exams e
    where e.id = new.exam_id;

    if not found then
      raise exception 'Examen destino UCAPSA no encontrado.'
        using errcode = '55000';
    end if;

    perform public.ucapsa_assert_competition_season_mutable(v_target_season_id);

    if v_target_exam_status is distinct from 'draft' then
      raise exception 'Un ejercicio solo puede moverse a otro examen en borrador.'
        using errcode = '55000';
    end if;
  end if;

  select exists (
    select 1
    from public.ucapsa_exam_attempts a
    where a.exam_id = v_exam_id
      and a.status in ('reviewed', 'published', 'voided')
  ) into v_has_locked_attempt;

  if tg_op = 'INSERT' and v_has_locked_attempt then
    raise exception 'No se pueden agregar ejercicios a un examen con intentos revisados/publicados/anulados.'
      using errcode = '55000';
  end if;

  if tg_op = 'DELETE' and v_has_locked_attempt then
    raise exception 'No se pueden eliminar ejercicios de un examen con intentos revisados/publicados/anulados.'
      using errcode = '55000';
  end if;

  if tg_op = 'UPDATE' then
    if new.exam_id is distinct from old.exam_id then
      select exists (
        select 1
        from public.ucapsa_exam_item_results r
        where r.exam_item_id = old.id
      ) into v_has_results;

      if v_has_results then
        raise exception 'No se puede mover a otro examen un ejercicio que ya tiene resultados.'
          using errcode = '55000';
      end if;
    end if;

    if new.max_points is distinct from old.max_points then
      select max(r.points_awarded) into v_max_awarded
      from public.ucapsa_exam_item_results r
      where r.exam_item_id = old.id;

      if v_max_awarded is not null and new.max_points < v_max_awarded then
        raise exception 'El nuevo maximo (%) es menor que una puntuacion ya capturada (%).', new.max_points, v_max_awarded
          using errcode = '55000';
      end if;
    end if;

    if (
      new.exam_id is distinct from old.exam_id
      or new.item_number is distinct from old.item_number
      or new.max_points is distinct from old.max_points
    ) then
      if v_has_locked_attempt or exists (
        select 1
        from public.ucapsa_exam_attempts a
        where a.exam_id = new.exam_id
          and a.status in ('reviewed', 'published', 'voided')
      ) then
        raise exception 'No se puede cambiar la estructura o puntaje maximo de un examen con intentos revisados/publicados/anulados.'
          using errcode = '55000';
      end if;
    end if;
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke all on function public.ucapsa_guard_exam_item_structure_after_publish()
  from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Examen: crear / configurar / publicar.
-- -----------------------------------------------------------------------------

create or replace function public.admin_create_ucapsa_exam(
  p_season_id uuid,
  p_code text,
  p_title text,
  p_description text default null,
  p_exam_date date default null,
  p_is_required_for_ranking boolean default true,
  p_sort_order integer default 0
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_code text := nullif(btrim(p_code), '');
  v_title text := nullif(btrim(p_title), '');
  v_season_status text;
begin
  if not public.is_ucapsa_admin() then
    raise exception 'Solo Admin puede crear examenes UCAPSA.';
  end if;
  if v_code is null or v_title is null then
    raise exception 'Codigo y titulo del examen son obligatorios.';
  end if;

  select s.status into v_season_status
  from public.ucapsa_competition_seasons s
  where s.id = p_season_id;
  if not found then raise exception 'Temporada UCAPSA no encontrada.'; end if;
  if v_season_status = 'closed' then
    raise exception 'La temporada esta cerrada. Reabrela antes de crear examenes.';
  end if;

  insert into public.ucapsa_exams (
    season_id, code, title, description, exam_date,
    is_required_for_ranking, sort_order, status, created_by
  ) values (
    p_season_id, v_code, v_title, nullif(btrim(p_description), ''), p_exam_date,
    coalesce(p_is_required_for_ranking, true), coalesce(p_sort_order, 0), 'draft', auth.uid()
  ) returning id into v_id;

  perform public.ucapsa_exam_admin_audit(
    'ucapsa_exam.create', 'ucapsa_exam', v_id,
    jsonb_build_object('season_id', p_season_id, 'code', v_code, 'title', v_title)
  );
  return v_id;
end;
$$;

create or replace function public.admin_update_ucapsa_exam(
  p_exam_id uuid,
  p_code text,
  p_title text,
  p_description text,
  p_exam_date date,
  p_is_required_for_ranking boolean,
  p_sort_order integer
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before public.ucapsa_exams%rowtype;
  v_code text := nullif(btrim(p_code), '');
  v_title text := nullif(btrim(p_title), '');
begin
  if not public.is_ucapsa_admin() then raise exception 'Solo Admin puede configurar examenes UCAPSA.'; end if;
  if v_code is null or v_title is null then raise exception 'Codigo y titulo son obligatorios.'; end if;

  select * into v_before from public.ucapsa_exams where id=p_exam_id for update;
  if not found then raise exception 'Examen UCAPSA no encontrado.'; end if;
  perform public.ucapsa_assert_competition_season_mutable(v_before.season_id);
  if v_before.status = 'archived' then raise exception 'Un examen archivado no puede configurarse.'; end if;
  if v_before.status <> 'draft' and v_code <> v_before.code then
    raise exception 'El codigo de un examen publicado no puede cambiar.';
  end if;

  update public.ucapsa_exams
  set code=v_code,
      title=v_title,
      description=nullif(btrim(p_description), ''),
      exam_date=p_exam_date,
      is_required_for_ranking=coalesce(p_is_required_for_ranking, false),
      sort_order=coalesce(p_sort_order, 0)
  where id=p_exam_id;

  perform public.ucapsa_exam_admin_audit(
    'ucapsa_exam.update', 'ucapsa_exam', p_exam_id,
    jsonb_build_object(
      'before', jsonb_build_object('code',v_before.code,'title',v_before.title,'exam_date',v_before.exam_date,'required',v_before.is_required_for_ranking,'sort_order',v_before.sort_order),
      'after', jsonb_build_object('code',v_code,'title',v_title,'exam_date',p_exam_date,'required',p_is_required_for_ranking,'sort_order',p_sort_order)
    )
  );
  return p_exam_id;
end;
$$;

create or replace function public.admin_publish_ucapsa_exam(p_exam_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_exam public.ucapsa_exams%rowtype;
begin
  if not public.is_ucapsa_admin() then raise exception 'Solo Admin puede publicar examenes UCAPSA.'; end if;
  select * into v_exam from public.ucapsa_exams where id=p_exam_id for update;
  if not found then raise exception 'Examen UCAPSA no encontrado.'; end if;
  if v_exam.status <> 'draft' then raise exception 'Solo un examen en borrador puede publicarse.'; end if;

  update public.ucapsa_exams
  set status='published', published_at=now(), published_by=auth.uid()
  where id=p_exam_id;

  perform public.ucapsa_exam_admin_audit('ucapsa_exam.publish','ucapsa_exam',p_exam_id,'{}'::jsonb);
  return p_exam_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- Ejercicios: una sola definición canónica del máximo de puntos.
-- -----------------------------------------------------------------------------

create or replace function public.admin_add_ucapsa_exam_item(
  p_exam_id uuid,
  p_title text,
  p_max_points numeric,
  p_description text default null,
  p_item_number integer default null,
  p_sort_order integer default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_exam public.ucapsa_exams%rowtype;
  v_id uuid;
  v_number integer;
  v_title text := nullif(btrim(p_title), '');
begin
  if not public.is_ucapsa_admin() then raise exception 'Solo Admin puede configurar ejercicios UCAPSA.'; end if;
  if v_title is null then raise exception 'El titulo del ejercicio es obligatorio.'; end if;
  if p_max_points is null or p_max_points <= 0 then raise exception 'max_points debe ser mayor que cero.'; end if;

  select * into v_exam from public.ucapsa_exams where id=p_exam_id for update;
  if not found then raise exception 'Examen UCAPSA no encontrado.'; end if;
  perform public.ucapsa_assert_competition_season_mutable(v_exam.season_id);
  if v_exam.status = 'archived' then raise exception 'No se puede editar un examen archivado.'; end if;

  if p_item_number is null then
    select coalesce(max(item_number),0)+1 into v_number
    from public.ucapsa_exam_items where exam_id=p_exam_id;
  else
    v_number := p_item_number;
  end if;

  insert into public.ucapsa_exam_items (
    exam_id,item_number,title,description,max_points,sort_order
  ) values (
    p_exam_id,v_number,v_title,nullif(btrim(p_description),''),p_max_points,coalesce(p_sort_order,v_number)
  ) returning id into v_id;

  perform public.ucapsa_exam_admin_audit(
    'ucapsa_exam_item.create','ucapsa_exam_item',v_id,
    jsonb_build_object('exam_id',p_exam_id,'item_number',v_number,'max_points',p_max_points)
  );
  return v_id;
end;
$$;

create or replace function public.admin_update_ucapsa_exam_item(
  p_exam_item_id uuid,
  p_item_number integer,
  p_title text,
  p_description text,
  p_max_points numeric,
  p_sort_order integer
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before public.ucapsa_exam_items%rowtype;
  v_title text := nullif(btrim(p_title), '');
begin
  if not public.is_ucapsa_admin() then raise exception 'Solo Admin puede configurar ejercicios UCAPSA.'; end if;
  if v_title is null then raise exception 'El titulo es obligatorio.'; end if;
  if p_item_number is null or p_item_number <= 0 then raise exception 'item_number debe ser mayor que cero.'; end if;
  if p_max_points is null or p_max_points <= 0 then raise exception 'max_points debe ser mayor que cero.'; end if;

  select * into v_before from public.ucapsa_exam_items where id=p_exam_item_id for update;
  if not found then raise exception 'Ejercicio UCAPSA no encontrado.'; end if;

  update public.ucapsa_exam_items
  set item_number=p_item_number,
      title=v_title,
      description=nullif(btrim(p_description),''),
      max_points=p_max_points,
      sort_order=coalesce(p_sort_order,p_item_number)
  where id=p_exam_item_id;

  perform public.ucapsa_exam_admin_audit(
    'ucapsa_exam_item.update','ucapsa_exam_item',p_exam_item_id,
    jsonb_build_object('exam_id',v_before.exam_id,'old_max',v_before.max_points,'new_max',p_max_points)
  );
  return p_exam_item_id;
end;
$$;

create or replace function public.admin_delete_ucapsa_exam_item(p_exam_item_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item public.ucapsa_exam_items%rowtype;
begin
  if not public.is_ucapsa_admin() then raise exception 'Solo Admin puede eliminar ejercicios UCAPSA.'; end if;
  select * into v_item from public.ucapsa_exam_items where id=p_exam_item_id for update;
  if not found then raise exception 'Ejercicio UCAPSA no encontrado.'; end if;

  delete from public.ucapsa_exam_items where id=p_exam_item_id;
  perform public.ucapsa_exam_admin_audit(
    'ucapsa_exam_item.delete','ucapsa_exam_item',p_exam_item_id,
    jsonb_build_object('exam_id',v_item.exam_id,'item_number',v_item.item_number,'max_points',v_item.max_points)
  );
  return p_exam_item_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- Intentos y captura manual.
-- -----------------------------------------------------------------------------

create or replace function public.admin_create_ucapsa_exam_attempt(
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
  if not public.is_ucapsa_admin() then raise exception 'Solo Admin puede capturar intentos UCAPSA.'; end if;
  if p_presented_at is null then raise exception 'presented_at es obligatorio.'; end if;
  if not exists (select 1 from public.dogs d where d.id=p_dog_id) then raise exception 'Perro no encontrado.'; end if;

  select * into v_exam from public.ucapsa_exams where id=p_exam_id for update;
  if not found then raise exception 'Examen UCAPSA no encontrado.'; end if;
  if v_exam.status <> 'published' then raise exception 'Sólo se capturan resultados sobre un examen publicado.'; end if;
  perform public.ucapsa_assert_competition_season_mutable(v_exam.season_id);

  select coalesce(max(a.attempt_number),0)+1 into v_attempt_number
  from public.ucapsa_exam_attempts a
  where a.exam_id=p_exam_id and a.dog_id=p_dog_id;

  insert into public.ucapsa_exam_attempts (
    exam_id,dog_id,attempt_number,status,is_official,presented_at,created_by
  ) values (
    p_exam_id,p_dog_id,v_attempt_number,'draft',false,p_presented_at,auth.uid()
  ) returning id into v_id;

  perform public.ucapsa_exam_admin_audit(
    'ucapsa_exam_attempt.create','ucapsa_exam_attempt',v_id,
    jsonb_build_object('exam_id',p_exam_id,'dog_id',p_dog_id,'attempt_number',v_attempt_number,'presented_at',p_presented_at)
  );
  return v_id;
end;
$$;

create or replace function public.admin_upsert_ucapsa_exam_item_result(
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
  if not public.is_ucapsa_admin() then raise exception 'Solo Admin puede capturar resultados UCAPSA.'; end if;
  if p_points_awarded is null or p_points_awarded < 0 then raise exception 'La puntuacion debe ser cero o mayor.'; end if;

  select * into v_attempt from public.ucapsa_exam_attempts where id=p_attempt_id for update;
  if not found then raise exception 'Intento UCAPSA no encontrado.'; end if;
  if v_attempt.status='voided' then raise exception 'No se puede editar un intento anulado.'; end if;
  perform public.ucapsa_assert_exam_mutable(v_attempt.exam_id);

  select exists(
    select 1 from public.ucapsa_exam_item_results r
    where r.attempt_id=p_attempt_id and r.exam_item_id=p_exam_item_id
  ) into v_existing;

  if v_attempt.status in ('reviewed','published') and not v_existing then
    raise exception 'Un intento revisado/publicado no puede agregar nuevas filas de ejercicios.';
  end if;

  insert into public.ucapsa_exam_item_results (
    attempt_id,exam_item_id,points_awarded,evaluator_note,updated_by
  ) values (
    p_attempt_id,p_exam_item_id,p_points_awarded,nullif(btrim(p_evaluator_note),''),auth.uid()
  )
  on conflict (attempt_id,exam_item_id) do update
    set points_awarded=excluded.points_awarded,
        evaluator_note=excluded.evaluator_note,
        updated_by=auth.uid();

  perform public.ucapsa_exam_admin_audit(
    'ucapsa_exam_result.upsert','ucapsa_exam_attempt',p_attempt_id,
    jsonb_build_object('exam_item_id',p_exam_item_id,'points_awarded',p_points_awarded,'attempt_status',v_attempt.status)
  );
  return p_attempt_id;
end;
$$;

create or replace function public.admin_delete_ucapsa_exam_item_result(
  p_attempt_id uuid,
  p_exam_item_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_attempt public.ucapsa_exam_attempts%rowtype;
begin
  if not public.is_ucapsa_admin() then raise exception 'Solo Admin puede eliminar resultados UCAPSA.'; end if;
  select * into v_attempt from public.ucapsa_exam_attempts where id=p_attempt_id for update;
  if not found then raise exception 'Intento UCAPSA no encontrado.'; end if;
  if v_attempt.status <> 'draft' then raise exception 'Sólo un intento en borrador puede perder una fila de resultado.'; end if;

  delete from public.ucapsa_exam_item_results
  where attempt_id=p_attempt_id and exam_item_id=p_exam_item_id;

  perform public.ucapsa_exam_admin_audit(
    'ucapsa_exam_result.delete','ucapsa_exam_attempt',p_attempt_id,
    jsonb_build_object('exam_item_id',p_exam_item_id)
  );
  return p_attempt_id;
end;
$$;

create or replace function public.admin_review_ucapsa_exam_attempt(p_attempt_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_attempt public.ucapsa_exam_attempts%rowtype;
begin
  if not public.is_ucapsa_admin() then raise exception 'Solo Admin puede revisar intentos UCAPSA.'; end if;
  select * into v_attempt from public.ucapsa_exam_attempts where id=p_attempt_id for update;
  if not found then raise exception 'Intento UCAPSA no encontrado.'; end if;
  if v_attempt.status <> 'draft' then raise exception 'Sólo un intento en borrador puede pasar a revisado.'; end if;

  update public.ucapsa_exam_attempts
  set status='reviewed',reviewed_at=now(),reviewed_by=auth.uid()
  where id=p_attempt_id;

  perform public.ucapsa_exam_admin_audit('ucapsa_exam_attempt.review','ucapsa_exam_attempt',p_attempt_id,'{}'::jsonb);
  return p_attempt_id;
end;
$$;

create or replace function public.admin_publish_ucapsa_exam_attempt(
  p_attempt_id uuid,
  p_make_official boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_attempt public.ucapsa_exam_attempts%rowtype;
begin
  if not public.is_ucapsa_admin() then raise exception 'Solo Admin puede publicar intentos UCAPSA.'; end if;
  select * into v_attempt from public.ucapsa_exam_attempts where id=p_attempt_id for update;
  if not found then raise exception 'Intento UCAPSA no encontrado.'; end if;
  if v_attempt.status not in ('reviewed','published') then
    raise exception 'El intento debe estar revisado antes de publicarse.';
  end if;
  perform public.ucapsa_assert_exam_mutable(v_attempt.exam_id);

  if coalesce(p_make_official,true) then
    update public.ucapsa_exam_attempts
    set is_official=false
    where exam_id=v_attempt.exam_id
      and dog_id=v_attempt.dog_id
      and id<>p_attempt_id
      and is_official=true;
  end if;

  update public.ucapsa_exam_attempts
  set status='published',
      is_official=coalesce(p_make_official,true),
      published_at=coalesce(published_at,now()),
      published_by=auth.uid()
  where id=p_attempt_id;

  perform public.ucapsa_exam_admin_audit(
    'ucapsa_exam_attempt.publish','ucapsa_exam_attempt',p_attempt_id,
    jsonb_build_object('make_official',coalesce(p_make_official,true),'dog_id',v_attempt.dog_id,'exam_id',v_attempt.exam_id)
  );
  return p_attempt_id;
end;
$$;

create or replace function public.admin_set_ucapsa_exam_official_attempt(p_attempt_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_attempt public.ucapsa_exam_attempts%rowtype;
begin
  if not public.is_ucapsa_admin() then raise exception 'Solo Admin puede seleccionar el intento oficial.'; end if;
  select * into v_attempt from public.ucapsa_exam_attempts where id=p_attempt_id for update;
  if not found then raise exception 'Intento UCAPSA no encontrado.'; end if;
  if v_attempt.status <> 'published' then raise exception 'Sólo un intento publicado puede ser oficial.'; end if;
  perform public.ucapsa_assert_exam_mutable(v_attempt.exam_id);

  update public.ucapsa_exam_attempts
  set is_official=false
  where exam_id=v_attempt.exam_id
    and dog_id=v_attempt.dog_id
    and id<>p_attempt_id
    and is_official=true;

  update public.ucapsa_exam_attempts
  set is_official=true
  where id=p_attempt_id;

  perform public.ucapsa_exam_admin_audit(
    'ucapsa_exam_attempt.set_official','ucapsa_exam_attempt',p_attempt_id,
    jsonb_build_object('dog_id',v_attempt.dog_id,'exam_id',v_attempt.exam_id)
  );
  return p_attempt_id;
end;
$$;

create or replace function public.admin_void_ucapsa_exam_attempt(p_attempt_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_attempt public.ucapsa_exam_attempts%rowtype;
begin
  if not public.is_ucapsa_admin() then raise exception 'Solo Admin puede anular intentos UCAPSA.'; end if;
  select * into v_attempt from public.ucapsa_exam_attempts where id=p_attempt_id for update;
  if not found then raise exception 'Intento UCAPSA no encontrado.'; end if;
  if v_attempt.status='voided' then raise exception 'El intento ya esta anulado.'; end if;
  perform public.ucapsa_assert_exam_mutable(v_attempt.exam_id);

  update public.ucapsa_exam_attempts
  set status='voided',is_official=false,voided_at=now(),voided_by=auth.uid()
  where id=p_attempt_id;

  perform public.ucapsa_exam_admin_audit(
    'ucapsa_exam_attempt.void','ucapsa_exam_attempt',p_attempt_id,
    jsonb_build_object('previous_status',v_attempt.status,'was_official',v_attempt.is_official)
  );
  return p_attempt_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- Permisos RPC. Todas validan is_ucapsa_admin() internamente.
-- -----------------------------------------------------------------------------

revoke all on function public.admin_create_ucapsa_exam(uuid,text,text,text,date,boolean,integer) from public, anon, authenticated;
revoke all on function public.admin_update_ucapsa_exam(uuid,text,text,text,date,boolean,integer) from public, anon, authenticated;
revoke all on function public.admin_publish_ucapsa_exam(uuid) from public, anon, authenticated;
revoke all on function public.admin_add_ucapsa_exam_item(uuid,text,numeric,text,integer,integer) from public, anon, authenticated;
revoke all on function public.admin_update_ucapsa_exam_item(uuid,integer,text,text,numeric,integer) from public, anon, authenticated;
revoke all on function public.admin_delete_ucapsa_exam_item(uuid) from public, anon, authenticated;
revoke all on function public.admin_create_ucapsa_exam_attempt(uuid,uuid,timestamptz) from public, anon, authenticated;
revoke all on function public.admin_upsert_ucapsa_exam_item_result(uuid,uuid,numeric,text) from public, anon, authenticated;
revoke all on function public.admin_delete_ucapsa_exam_item_result(uuid,uuid) from public, anon, authenticated;
revoke all on function public.admin_review_ucapsa_exam_attempt(uuid) from public, anon, authenticated;
revoke all on function public.admin_publish_ucapsa_exam_attempt(uuid,boolean) from public, anon, authenticated;
revoke all on function public.admin_set_ucapsa_exam_official_attempt(uuid) from public, anon, authenticated;
revoke all on function public.admin_void_ucapsa_exam_attempt(uuid) from public, anon, authenticated;

grant execute on function public.admin_create_ucapsa_exam(uuid,text,text,text,date,boolean,integer) to authenticated;
grant execute on function public.admin_update_ucapsa_exam(uuid,text,text,text,date,boolean,integer) to authenticated;
grant execute on function public.admin_publish_ucapsa_exam(uuid) to authenticated;
grant execute on function public.admin_add_ucapsa_exam_item(uuid,text,numeric,text,integer,integer) to authenticated;
grant execute on function public.admin_update_ucapsa_exam_item(uuid,integer,text,text,numeric,integer) to authenticated;
grant execute on function public.admin_delete_ucapsa_exam_item(uuid) to authenticated;
grant execute on function public.admin_create_ucapsa_exam_attempt(uuid,uuid,timestamptz) to authenticated;
grant execute on function public.admin_upsert_ucapsa_exam_item_result(uuid,uuid,numeric,text) to authenticated;
grant execute on function public.admin_delete_ucapsa_exam_item_result(uuid,uuid) to authenticated;
grant execute on function public.admin_review_ucapsa_exam_attempt(uuid) to authenticated;
grant execute on function public.admin_publish_ucapsa_exam_attempt(uuid,boolean) to authenticated;
grant execute on function public.admin_set_ucapsa_exam_official_attempt(uuid) to authenticated;
grant execute on function public.admin_void_ucapsa_exam_attempt(uuid) to authenticated;
