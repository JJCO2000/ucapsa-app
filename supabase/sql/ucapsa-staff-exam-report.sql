-- Reporte de evaluaciones UCAPSA. Solo lectura de fuentes oficiales.
-- Una fila por intento y ejercicio; no agrega resultados faltantes como cero.
-- El entrenador solo consulta perros dentro de su alcance operativo.
create or replace function public.get_staff_exam_report(
  p_start_date date,
  p_end_date date,
  p_exam_id uuid default null
)
returns table (
  attempt_id uuid,
  exam_id uuid,
  exam_code text,
  exam_title text,
  class_date date,
  attempt_number integer,
  attempt_status text,
  is_official boolean,
  voided_at timestamptz,
  dog_id uuid,
  dog_name text,
  client_name text,
  item_id uuid,
  item_number integer,
  item_title text,
  max_points numeric,
  points_awarded numeric,
  evaluator_note text
)
language plpgsql stable security definer
set search_path = public
as $function$
begin
  if not public.is_ucapsa_staff() then
    raise exception 'Solo personal UCAPSA puede exportar evaluaciones.'
      using errcode = '42501';
  end if;
  if p_start_date is null or p_end_date is null or p_start_date > p_end_date
     or (p_end_date - p_start_date) > 366 then
    raise exception 'Elige un rango válido de hasta 366 días.'
      using errcode = '22023';
  end if;

  return query
  select
    a.id,
    e.id,
    e.code::text,
    e.title::text,
    (a.presented_at at time zone 'America/Mexico_City')::date,
    a.attempt_number,
    a.status::text,
    a.is_official,
    a.voided_at,
    a.dog_id,
    coalesce(d.name, 'Perro')::text,
    coalesce(nullif(p.full_name,''), p.email, 'Cliente UCAPSA')::text,
    i.id,
    i.item_number,
    i.title::text,
    i.max_points,
    r.points_awarded,
    r.evaluator_note::text
  from public.ucapsa_exam_attempts a
  join public.ucapsa_exams e on e.id = a.exam_id
  left join public.dogs d on d.id = a.dog_id
  left join public.profiles p on p.user_id = d.user_id
  left join public.ucapsa_exam_items i on i.exam_id = e.id
  left join public.ucapsa_exam_item_results r
    on r.attempt_id = a.id and r.exam_item_id = i.id
  where (a.presented_at at time zone 'America/Mexico_City')::date between p_start_date and p_end_date
    and (p_exam_id is null or e.id = p_exam_id)
    and public.can_ucapsa_staff_access_dog(a.dog_id)
  order by a.presented_at desc, e.code, a.id, i.sort_order, i.item_number;
end;
$function$;

revoke all on function public.get_staff_exam_report(date,date,uuid)
  from public, anon;
grant execute on function public.get_staff_exam_report(date,date,uuid)
  to authenticated, service_role;
