-- UCAPSA: edición de definiciones guardadas en BORRADOR por staff.
-- SSOT: ucapsa_exams + ucapsa_exam_items, no copias ni estructuras alternativas.
-- Permisos: servidor, no interfaz. No afecta intentos, calificaciones ni rankings.
-- SELECT de borrador independiente del SELECT de exámenes publicados.
create or replace function public.get_staff_editable_ucapsa_exam_draft(p_exam_id uuid)
returns jsonb
language plpgsql stable security definer
set search_path = public
as $fn$
declare
  v_exam public.ucapsa_exams%rowtype;
  v_season_status text;
  v_items jsonb;
begin
  if not public.is_ucapsa_staff() then
    raise exception 'Solo staff UCAPSA puede consultar borradores.' using errcode = '42501';
  end if;
  select e.* into v_exam
  from public.ucapsa_exams e
  where e.id = p_exam_id;
  if not found or v_exam.status <> 'draft' then
    raise exception 'Borrador no disponible para edición.' using errcode = '22023';
  end if;
  select s.status into v_season_status
  from public.ucapsa_competition_seasons s where s.id = v_exam.season_id;
  if v_season_status not in ('active', 'reopened') then
    raise exception 'La temporada no permite editar borradores.' using errcode = '55000';
  end if;
  if exists (select 1 from public.ucapsa_exam_attempts a where a.exam_id = p_exam_id) then
    raise exception 'Este examen ya tiene intentos y no permite cambiar ejercicios.' using errcode = '55000';
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object('title', i.title, 'description', i.description, 'max_points', i.max_points)
    order by i.sort_order, i.item_number
  ), '[]'::jsonb) into v_items
  from public.ucapsa_exam_items i where i.exam_id = p_exam_id;

  return jsonb_build_object(
    'exam_id', v_exam.id,
    'code', v_exam.code,
    'title', v_exam.title,
    'exam_date', v_exam.exam_date,
    'updated_at', v_exam.updated_at,
    'items', v_items
  );
end;
$fn$;

revoke all on function public.get_staff_editable_ucapsa_exam_draft(uuid)
  from public, anon;
grant execute on function public.get_staff_editable_ucapsa_exam_draft(uuid)
  to authenticated, service_role;

-- Toda la sustitución se ejecuta dentro de una transacción PostgreSQL;
-- un error deja el borrador intacto. Solo borradores sin intentos evaluados.
create or replace function public.staff_update_ucapsa_exam_draft(
  p_exam_id uuid,
  p_code text,
  p_title text,
  p_exam_date date,
  p_items jsonb,
  p_expected_updated_at timestamptz
)
returns uuid
language plpgsql security definer
set search_path = public
as $fn$
declare
  v_exam public.ucapsa_exams%rowtype;
  v_season_status text;
  v_code text := nullif(btrim(coalesce(p_code, '')), '');
  v_title text := nullif(btrim(coalesce(p_title, '')), '');
  v_item jsonb;
  v_ord bigint;
  v_item_title text;
  v_item_description text;
  v_max_points numeric;
  v_count integer;
begin
  if not public.is_ucapsa_staff() then
    raise exception 'Solo staff UCAPSA puede editar borradores.' using errcode = '42501';
  end if;
  if v_code is null or length(v_code) > 80 or v_title is null or length(v_title) > 160 then
    raise exception 'Código o título de examen inválido.' using errcode = '22023';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) not between 1 and 100 then
    raise exception 'El borrador necesita entre 1 y 100 ejercicios.' using errcode = '22023';
  end if;

  select e.* into v_exam from public.ucapsa_exams e
  where e.id = p_exam_id for update;
  if not found or v_exam.status <> 'draft' then
    raise exception 'Solo se pueden editar exámenes en borrador.' using errcode = '55000';
  end if;
  if p_expected_updated_at is null
     or v_exam.updated_at is distinct from p_expected_updated_at then
    raise exception 'El borrador cambió desde que lo abriste. Recarga antes de guardar.'
      using errcode = '40001';
  end if;
  select s.status into v_season_status
  from public.ucapsa_competition_seasons s where s.id = v_exam.season_id;
  if v_season_status not in ('active', 'reopened') then
    raise exception 'La temporada ya no permite editar borradores.' using errcode = '55000';
  end if;
  -- Prohibido regenerar IDs de ejercicios con intentos existentes.
  if exists (select 1 from public.ucapsa_exam_attempts a where a.exam_id = p_exam_id) then
    raise exception 'El examen tiene intentos: no es seguro reemplazar los ejercicios.'
      using errcode = '55000';
  end if;
  if exists (
    select 1 from public.ucapsa_exams e
    where e.season_id = v_exam.season_id
      and e.id <> p_exam_id
      and lower(btrim(e.code)) = lower(v_code)
  ) then
    raise exception 'Ya existe otro examen con este código en la temporada.'
      using errcode = '23505';
  end if;

  -- Validación completa antes de una sola escritura.
  for v_item, v_ord in
    select value, ordinality from jsonb_array_elements(p_items) with ordinality
  loop
    if jsonb_typeof(v_item) <> 'object' then
      raise exception 'Ejercicio % inválido.', v_ord using errcode = '22023';
    end if;
    v_item_title := nullif(btrim(coalesce(v_item->>'title', '')), '');
    v_item_description := nullif(btrim(coalesce(v_item->>'description', '')), '');
    if v_item_title is null or length(v_item_title) > 160
       or length(coalesce(v_item_description, '')) > 2000 then
      raise exception 'Título o descripción inválidos en ejercicio %.', v_ord using errcode = '22023';
    end if;
    begin
      v_max_points := (v_item->>'max_points')::numeric;
    exception when others then
      v_max_points := null;
    end;
    if v_max_points is null or v_max_points <= 0
       or v_max_points > 1000 or trunc(v_max_points, 2) <> v_max_points then
      raise exception 'Puntaje inválido en ejercicio %.', v_ord using errcode = '22023';
    end if;
  end loop;

  update public.ucapsa_exams
  set code = v_code, title = v_title, exam_date = p_exam_date,
      updated_at = clock_timestamp()
  where id = p_exam_id;

  delete from public.ucapsa_exam_items where exam_id = p_exam_id;
  for v_item, v_ord in
    select value, ordinality from jsonb_array_elements(p_items) with ordinality
  loop
    insert into public.ucapsa_exam_items
      (exam_id, item_number, title, description, max_points, sort_order)
    values (
      p_exam_id, v_ord::integer,
      btrim(v_item->>'title'),
      nullif(btrim(coalesce(v_item->>'description', '')), ''),
      (v_item->>'max_points')::numeric, v_ord::integer
    );
  end loop;

  select count(*) into v_count from public.ucapsa_exam_items i where i.exam_id = p_exam_id;
  if v_count <> jsonb_array_length(p_items) then
    raise exception 'No se pudo guardar la estructura completa.' using errcode = '55000';
  end if;

  insert into public.admin_audit_logs
    (admin_user_id, action, entity_type, entity_id, details)
  values (
    auth.uid(), 'ucapsa_exam.staff_draft_edit', 'ucapsa_exam',
    p_exam_id,
    jsonb_build_object('code_before', v_exam.code, 'code_after', v_code,
      'title_before', v_exam.title, 'title_after', v_title,
      'items_count', v_count, 'updated_at_before', v_exam.updated_at)
  );
  return p_exam_id;
end;
$fn$;

revoke all on function public.staff_update_ucapsa_exam_draft(uuid,text,text,date,jsonb,timestamptz)
  from public, anon;
grant execute on function public.staff_update_ucapsa_exam_draft(uuid,text,text,date,jsonb,timestamptz)
  to authenticated, service_role;
