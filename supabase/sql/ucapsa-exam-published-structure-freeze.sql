-- Freeze UCAPSA exam structure as soon as the exam is published.
-- The existing trigger already calls this function for INSERT/UPDATE/DELETE.

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
  if tg_op = 'INSERT' then v_exam_id := new.exam_id; else v_exam_id := old.exam_id; end if;

  select e.status into v_exam_status
  from public.ucapsa_exams e
  where e.id = v_exam_id;

  if v_exam_status is distinct from 'draft' then
    raise exception 'La estructura de un examen publicado o archivado no puede modificarse.'
      using errcode = '55000';
  end if;

  if tg_op = 'UPDATE' and new.exam_id is distinct from old.exam_id then
    select e.status into v_target_exam_status
    from public.ucapsa_exams e
    where e.id = new.exam_id;

    if v_target_exam_status is distinct from 'draft' then
      raise exception 'Un ejercicio solo puede moverse a otro examen en borrador.'
        using errcode = '55000';
    end if;
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
        select 1
        from public.ucapsa_exam_attempts a
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

revoke all on function public.ucapsa_guard_exam_item_structure_after_publish()
  from public, anon, authenticated;
