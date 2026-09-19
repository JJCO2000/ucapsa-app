-- Freeze UCAPSA exam structure when an exam leaves draft.
-- Production currently has no exam rows, so this closes the lifecycle before
-- formal evidence exists without rewriting history.

create or replace function public.ucapsa_guard_exam_item_structure_after_publish()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_exam_id uuid;
  v_exam_status text;
  v_target_exam_status text;
  v_has_locked_attempt boolean;
  v_has_results boolean;
  v_max_awarded numeric;
begin
  if tg_op = 'INSERT' then
    v_exam_id := new.exam_id;
  else
    v_exam_id := old.exam_id;
  end if;

  select e.status
    into v_exam_status
  from public.ucapsa_exams e
  where e.id = v_exam_id;

  if not found then
    raise exception 'Examen UCAPSA no encontrado.'
      using errcode = '55000';
  end if;

  if v_exam_status <> 'draft' then
    raise exception 'La estructura de un examen publicado/archivado esta congelada. Crea una nueva version en borrador para cambiar ejercicios.'
      using errcode = '55000';
  end if;

  select exists (
    select 1
    from public.ucapsa_exam_attempts a
    where a.exam_id = v_exam_id
      and a.status in ('reviewed', 'published')
  ) into v_has_locked_attempt;

  if tg_op = 'INSERT' and v_has_locked_attempt then
    raise exception 'No se pueden agregar ejercicios a un examen con intentos revisados/publicados.'
      using errcode = '55000';
  end if;

  if tg_op = 'DELETE' and v_has_locked_attempt then
    raise exception 'No se pueden eliminar ejercicios de un examen con intentos revisados/publicados.'
      using errcode = '55000';
  end if;

  if tg_op = 'UPDATE' then
    if new.exam_id is distinct from old.exam_id then
      select e.status
        into v_target_exam_status
      from public.ucapsa_exams e
      where e.id = new.exam_id;

      if not found then
        raise exception 'Examen destino UCAPSA no encontrado.'
          using errcode = '55000';
      end if;

      if v_target_exam_status <> 'draft' then
        raise exception 'No se puede mover un ejercicio a un examen publicado/archivado.'
          using errcode = '55000';
      end if;

      select exists (
        select 1 from public.ucapsa_exam_item_results r
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

    if (new.exam_id is distinct from old.exam_id
      or new.item_number is distinct from old.item_number
      or new.max_points is distinct from old.max_points) then
      if v_has_locked_attempt or exists (
        select 1 from public.ucapsa_exam_attempts a
        where a.exam_id = new.exam_id
          and a.status in ('reviewed', 'published')
      ) then
        raise exception 'No se puede cambiar la estructura o puntaje maximo de un examen con intentos revisados/publicados.'
          using errcode = '55000';
      end if;
    end if;
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

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
  if v_exam.status <> 'draft' then raise exception 'Solo un examen en borrador puede cambiar su estructura.'; end if;

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
  v_exam_status text;
  v_title text := nullif(btrim(p_title), '');
begin
  if not public.is_ucapsa_admin() then raise exception 'Solo Admin puede configurar ejercicios UCAPSA.'; end if;
  if v_title is null then raise exception 'El titulo es obligatorio.'; end if;
  if p_item_number is null or p_item_number <= 0 then raise exception 'item_number debe ser mayor que cero.'; end if;
  if p_max_points is null or p_max_points <= 0 then raise exception 'max_points debe ser mayor que cero.'; end if;

  select * into v_before from public.ucapsa_exam_items where id=p_exam_item_id for update;
  if not found then raise exception 'Ejercicio UCAPSA no encontrado.'; end if;

  select e.status into v_exam_status
  from public.ucapsa_exams e
  where e.id=v_before.exam_id;
  if v_exam_status <> 'draft' then raise exception 'Solo un examen en borrador puede cambiar su estructura.'; end if;

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
  v_exam_status text;
begin
  if not public.is_ucapsa_admin() then raise exception 'Solo Admin puede eliminar ejercicios UCAPSA.'; end if;
  select * into v_item from public.ucapsa_exam_items where id=p_exam_item_id for update;
  if not found then raise exception 'Ejercicio UCAPSA no encontrado.'; end if;

  select e.status into v_exam_status
  from public.ucapsa_exams e
  where e.id=v_item.exam_id;
  if v_exam_status <> 'draft' then raise exception 'Solo un examen en borrador puede cambiar su estructura.'; end if;

  delete from public.ucapsa_exam_items where id=p_exam_item_id;
  perform public.ucapsa_exam_admin_audit(
    'ucapsa_exam_item.delete','ucapsa_exam_item',p_exam_item_id,
    jsonb_build_object('exam_id',v_item.exam_id,'item_number',v_item.item_number,'max_points',v_item.max_points)
  );
  return p_exam_item_id;
end;
$$;

