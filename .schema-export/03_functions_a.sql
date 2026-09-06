CREATE OR REPLACE FUNCTION public.admin_change_program_schedule_from_date(p_schedule_id uuid, p_effective_from date, p_name text, p_day_of_week integer, p_start_time time without time zone, p_repeat_type text, p_cycle_start_date date DEFAULT NULL::date, p_sequence_order integer DEFAULT 1, p_is_active boolean DEFAULT true, p_change_note text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_new_version_id uuid;
  v_cycle_start date;
  v_now timestamptz := now();
begin
  if not public.is_admin() then
    raise exception 'Solo administradores pueden cambiar horarios.';
  end if;

  if p_effective_from is null or p_effective_from < (clock_timestamp() at time zone 'America/Mexico_City')::date then
    raise exception 'El cambio debe iniciar hoy o en una fecha futura. El historial no se reescribe.';
  end if;

  if p_day_of_week < 0 or p_day_of_week > 6 then
    raise exception 'Dia de semana invalido.';
  end if;

  if p_repeat_type not in ('weekly','biweekly') then
    raise exception 'Repeticion invalida.';
  end if;

  if p_start_time is null then
    raise exception 'La hora es obligatoria.';
  end if;

  perform 1
  from public.program_schedules
  where id = p_schedule_id
  for update;

  if not found then
    raise exception 'Horario no encontrado.';
  end if;

  if exists (
    select 1
    from public.program_sessions ps
    where ps.schedule_id = p_schedule_id
      and ps.session_date = p_effective_from
  ) then
    raise exception 'Ese dia ya tiene una sesion real. Inicia el cambio en una fecha posterior.';
  end if;

  v_cycle_start := case
    when p_repeat_type = 'biweekly' then coalesce(p_cycle_start_date, p_effective_from)
    else null
  end;

  update public.program_schedule_versions
  set retired_at = v_now,
      retired_by = v_user_id
  where schedule_id = p_schedule_id
    and retired_at is null
    and effective_from >= p_effective_from;

  update public.program_schedule_versions
  set effective_to = p_effective_from - 1
  where schedule_id = p_schedule_id
    and retired_at is null
    and effective_from < p_effective_from
    and (effective_to is null or effective_to >= p_effective_from);

  insert into public.program_schedule_versions (
    schedule_id, effective_from, effective_to, name, day_of_week, start_time,
    repeat_type, cycle_start_date, sequence_order, is_active, change_note, created_by
  ) values (
    p_schedule_id, p_effective_from, null,
    coalesce(nullif(btrim(p_name), ''), 'Horario'), p_day_of_week, p_start_time,
    p_repeat_type, v_cycle_start, greatest(1, coalesce(p_sequence_order, 1)),
    coalesce(p_is_active, true), nullif(btrim(p_change_note), ''), v_user_id
  )
  returning id into v_new_version_id;

  update public.announcements a
  set is_published = false,
      archived_at = coalesce(a.archived_at, v_now)
  where a.id in (
    select c.announcement_id
    from public.program_class_cancellations c
    where c.schedule_id = p_schedule_id
      and c.cancellation_date >= p_effective_from
      and c.restored_at is null
      and c.announcement_id is not null
  );

  update public.program_class_cancellations
  set restored_at = v_now,
      restored_by = v_user_id,
      updated_at = v_now
  where schedule_id = p_schedule_id
    and cancellation_date >= p_effective_from
    and restored_at is null;

  delete from public.notification_class_reminder_locks
  where schedule_id = p_schedule_id
    and class_date >= p_effective_from
    and sent_at is null;

  delete from public.notification_class_cancellation_locks
  where schedule_id = p_schedule_id
    and cancellation_date >= p_effective_from
    and sent_at is null;

  return v_new_version_id;
end;
$function$

CREATE OR REPLACE FUNCTION public.admin_create_basic_dog(p_user_id uuid, p_name text)
 RETURNS TABLE(id uuid, name text, is_active boolean, created_at timestamp with time zone, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_name text := btrim(coalesce(p_name, ''));
  v_dog public.dogs%rowtype;
begin
  if not public.is_admin() then raise exception 'Solo administradores pueden registrar perros para clientes.'; end if;
  if p_user_id is null or not exists (select 1 from public.profiles p where p.user_id = p_user_id) then
    raise exception 'Cliente no encontrado.';
  end if;
  if v_name = '' then raise exception 'El nombre del perro es obligatorio.'; end if;
  insert into public.dogs (user_id, name, is_active) values (p_user_id, v_name, true) returning * into v_dog;
  return query select v_dog.id, v_dog.name, v_dog.is_active, v_dog.created_at, v_dog.updated_at;
end;
$function$

CREATE OR REPLACE FUNCTION public.correct_member_visit_admin(p_visit_id uuid, p_visited_at timestamp with time zone, p_notes text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.is_admin() then raise exception 'Solo administradores pueden corregir visitas.'; end if;
  update public.member_visits
  set visited_at = p_visited_at,
      visit_date = (p_visited_at at time zone 'America/Mexico_City')::date,
      notes = nullif(btrim(p_notes), ''),
      recorded_by = auth.uid(),
      updated_at = now()
  where id = p_visit_id;
  if not found then raise exception 'Visita no encontrada.'; end if;
end;
$function$

CREATE OR REPLACE FUNCTION public.correct_program_attendance_admin(p_attendance_id uuid, p_attendance_date date, p_schedule_id uuid, p_notes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_attendance public.program_attendances%rowtype;
  v_enrollment public.program_enrollments%rowtype;
  v_schedule record;
  v_session_id uuid;
begin
  if not public.is_admin() then raise exception 'Solo administradores pueden corregir asistencias.'; end if;
  if p_attendance_date > (clock_timestamp() at time zone 'America/Mexico_City')::date then raise exception 'No se puede registrar asistencia en una fecha futura.'; end if;
  select * into v_attendance from public.program_attendances where id = p_attendance_id;
  if not found then raise exception 'Asistencia no encontrada.'; end if;
  select * into v_enrollment from public.program_enrollments where id = v_attendance.enrollment_id;
  if not found then raise exception 'Inscripcion no encontrada.'; end if;
  select * into v_schedule from public.get_effective_program_schedule(p_schedule_id, p_attendance_date) where program_id = v_enrollment.program_id;
  if not found then raise exception 'El horario no pertenece al programa o no existia en esa fecha.'; end if;
  if not public.program_schedule_occurs_on_date(p_schedule_id, p_attendance_date) then raise exception 'La fecha no corresponde al horario y ciclo configurados para esa fecha.'; end if;
  if exists (select 1 from public.program_class_cancellations c where c.schedule_id = p_schedule_id and c.cancellation_date = p_attendance_date and c.restored_at is null) then raise exception 'La clase de esa fecha esta cancelada.'; end if;
  if exists (select 1 from public.program_attendances a where a.enrollment_id = v_attendance.enrollment_id and a.attendance_date = p_attendance_date and a.id <> p_attendance_id) then raise exception 'Ya existe otra asistencia para esta inscripcion en esa fecha.'; end if;
  insert into public.program_sessions (schedule_id, session_date, scheduled_start_time, created_by)
  values (p_schedule_id, p_attendance_date, v_schedule.start_time, auth.uid())
  on conflict (schedule_id, session_date) do nothing
  returning id into v_session_id;
  if v_session_id is null then select id into v_session_id from public.program_sessions where schedule_id = p_schedule_id and session_date = p_attendance_date; end if;
  if exists (select 1 from public.program_attendances a where a.session_id = v_session_id and a.enrollment_id = v_attendance.enrollment_id and a.id <> p_attendance_id) then raise exception 'Ya existe otra asistencia para esta clase.'; end if;
  update public.program_attendances
  set attendance_date = p_attendance_date, session_id = v_session_id, source = 'admin_manual', marked_by = auth.uid(), recorded_at = now(), notes = nullif(btrim(p_notes), ''), updated_at = now()
  where id = p_attendance_id;
  return p_attendance_id;
end;
$function$

CREATE OR REPLACE FUNCTION public.create_my_basic_dog(p_name text)
 RETURNS TABLE(id uuid, name text, is_active boolean, created_at timestamp with time zone, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_name text := btrim(coalesce(p_name, ''));
  v_dog public.dogs%rowtype;
begin
  if v_user_id is null then raise exception 'No hay sesion activa.'; end if;
  if v_name = '' then raise exception 'Escribe el nombre de tu perro.'; end if;
  if length(v_name) > 80 then raise exception 'El nombre es demasiado largo.'; end if;
  if v_name ~ '[[:cntrl:]]' then raise exception 'El nombre contiene caracteres no permitidos.'; end if;
  if exists (select 1 from public.dogs d where d.user_id = v_user_id and d.is_active and lower(btrim(d.name)) = lower(v_name)) then raise exception 'Ya tienes un perro activo con ese nombre.'; end if;
  insert into public.dogs (user_id, name, is_active) values (v_user_id, v_name, true) returning * into v_dog;
  update public.profiles p set dog_name = v_name, updated_at = now() where p.user_id = v_user_id and nullif(btrim(p.dog_name), '') is null;
  return query select v_dog.id, v_dog.name, v_dog.is_active, v_dog.created_at, v_dog.updated_at;
end;
$function$

CREATE OR REPLACE FUNCTION public.delete_member_visit_admin(p_visit_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.is_admin() then raise exception 'Solo administradores pueden quitar visitas.'; end if;
  delete from public.member_visits where id = p_visit_id;
  if not found then raise exception 'Visita no encontrada.'; end if;
end;
$function$

CREATE OR REPLACE FUNCTION public.delete_program_attendance_admin(p_attendance_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_enrollment_id uuid;
begin
  if not public.is_admin() then raise exception 'Solo administradores pueden quitar asistencias.'; end if;
  select enrollment_id into v_enrollment_id from public.program_attendances where id = p_attendance_id;
  if v_enrollment_id is null then raise exception 'Asistencia no encontrada.'; end if;
  delete from public.program_attendances where id = p_attendance_id;
  perform public.refresh_program_enrollment_progress(v_enrollment_id);
end;
$function$

CREATE OR REPLACE FUNCTION public.disable_notification_token(p_expo_push_token text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then raise exception 'Not authenticated'; end if;
  update public.notification_tokens set is_active = false, disabled_at = now(), updated_at = now() where expo_push_token = p_expo_push_token and user_id = v_user_id;
end;
$function$

CREATE OR REPLACE FUNCTION public.ensure_program_enrollment_dog_link()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_name text := btrim(coalesce(new.dog_name, ''));
  v_linked_name text;
  v_dog_id uuid;
begin
  if new.user_id is null then return new; end if;
  if new.dog_id is not null then
    select d.name into v_linked_name from public.dogs d where d.id = new.dog_id and d.user_id = new.user_id;
    if not found then raise exception 'El perro seleccionado no pertenece a este cliente.'; end if;
    if v_name = '' then new.dog_name := v_linked_name; return new; end if;
    if lower(v_name) = lower(btrim(v_linked_name)) then return new; end if;
    new.dog_id := null;
  end if;
  if v_name = '' then return new; end if;
  if length(v_name) > 80 then raise exception 'El nombre del perro es demasiado largo.'; end if;
  if v_name ~ '[[:cntrl:]]' then raise exception 'El nombre del perro contiene caracteres no permitidos.'; end if;
  select d.id into v_dog_id from public.dogs d where d.user_id = new.user_id and d.is_active and lower(btrim(d.name)) = lower(v_name) order by d.created_at, d.id limit 1;
  if v_dog_id is null then
    insert into public.dogs (user_id, name, is_active) values (new.user_id, v_name, true) returning id into v_dog_id;
    update public.profiles p set dog_name = v_name, updated_at = now() where p.user_id = new.user_id and nullif(btrim(p.dog_name), '') is null;
  end if;
  new.dog_id := v_dog_id;
  new.dog_name := v_name;
  return new;
end;
$function$

CREATE OR REPLACE FUNCTION public.get_admin_attendance_day(p_date date)
 RETURNS TABLE(attendance_id uuid, attendance_date date, scheduled_start_time time without time zone, session_id uuid, program_code text, program_name text, program_level text, schedule_id uuid, schedule_name text, user_id uuid, client_name text, client_email text, dog_name text, member_number text, physical_card_number text, source text, recorded_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.is_admin() then raise exception 'Solo administradores pueden consultar este reporte.'; end if;
  return query
  select a.id, a.attendance_date, ps.scheduled_start_time, ps.id, p.code, p.name, e.program_level, s.id, coalesce(eff.name, s.name), e.user_id, coalesce(pr.full_name, pr.email, 'Cliente UCAPSA'), pr.email, coalesce(d.name, e.dog_name, pr.dog_name), m.member_number, e.physical_card_number, a.source, a.recorded_at
  from public.program_attendances a
  join public.program_enrollments e on e.id = a.enrollment_id
  join public.programs p on p.id = e.program_id
  left join public.program_sessions ps on ps.id = a.session_id
  left join public.program_schedules s on s.id = ps.schedule_id
  left join lateral public.get_effective_program_schedule(s.id, a.attendance_date) eff on s.id is not null
  left join public.profiles pr on pr.user_id = e.user_id
  left join public.memberships m on m.user_id = e.user_id
  left join public.dogs d on d.id = e.dog_id
  where a.attendance_date = p_date
  order by ps.scheduled_start_time nulls last, p.code, pr.full_name nulls last, e.dog_name nulls last;
end;
$function$

CREATE OR REPLACE FUNCTION public.get_admin_member_visit_monthly_stats(p_months integer DEFAULT 12)
 RETURNS TABLE(month_start date, total_visits integer, unique_members integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.is_admin() then raise exception 'Solo administradores pueden consultar estadisticas de visitas.'; end if;
  return query
  with months as (
    select generate_series(date_trunc('month', (clock_timestamp() at time zone 'America/Mexico_City'))::date - ((greatest(2, least(coalesce(p_months, 12), 24)) - 1) * interval '1 month'), date_trunc('month', (clock_timestamp() at time zone 'America/Mexico_City'))::date, interval '1 month')::date as month_start
  ), aggregated as (
    select date_trunc('month', mv.visit_date::timestamp)::date as month_start, count(*)::int as total_visits, count(distinct mv.user_id)::int as unique_members
    from public.member_visits mv
    where mv.visit_date >= (select min(m.month_start) from months m)
    group by 1
  )
  select m.month_start, coalesce(a.total_visits, 0)::int, coalesce(a.unique_members, 0)::int from months m left join aggregated a using (month_start) order by m.month_start;
end;
$function$

CREATE OR REPLACE FUNCTION public.get_effective_program_schedule(p_schedule_id uuid, p_date date)
 RETURNS TABLE(schedule_id uuid, program_id uuid, name text, day_of_week integer, start_time time without time zone, repeat_type text, cycle_start_date date, sequence_order integer, is_active boolean, effective_from date, effective_to date, version_id uuid)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select s.id, s.program_id, coalesce(v.name, s.name), coalesce(v.day_of_week, s.day_of_week), coalesce(v.start_time, s.start_time::time), coalesce(v.repeat_type, s.repeat_type), coalesce(v.cycle_start_date, s.cycle_start_date), coalesce(v.sequence_order, s.sequence_order), coalesce(v.is_active, s.is_active), coalesce(v.effective_from, date '1900-01-01'), v.effective_to, v.id
  from public.program_schedules s
  left join lateral (
    select vv.* from public.program_schedule_versions vv
    where vv.schedule_id = s.id and vv.retired_at is null and vv.effective_from <= p_date and (vv.effective_to is null or vv.effective_to >= p_date)
    order by vv.effective_from desc, vv.created_at desc limit 1
  ) v on true
  where s.id = p_schedule_id and (v.id is not null or not exists (select 1 from public.program_schedule_versions any_v where any_v.schedule_id = s.id and any_v.retired_at is null));
$function$

CREATE OR REPLACE FUNCTION public.get_effective_program_schedules(p_date date)
 RETURNS TABLE(id uuid, program_id uuid, name text, day_of_week integer, start_time time without time zone, repeat_type text, cycle_start_date date, sequence_order integer, is_active boolean, effective_from date, effective_to date, version_id uuid)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select eff.schedule_id, eff.program_id, eff.name, eff.day_of_week, eff.start_time, eff.repeat_type, eff.cycle_start_date, eff.sequence_order, eff.is_active, eff.effective_from, eff.effective_to, eff.version_id
  from public.program_schedules s cross join lateral public.get_effective_program_schedule(s.id, p_date) eff;
$function$

CREATE OR REPLACE FUNCTION public.get_my_basic_dogs()
 RETURNS TABLE(id uuid, name text, is_active boolean, created_at timestamp with time zone, updated_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select d.id, d.name, d.is_active, d.created_at, d.updated_at
  from public.dogs d
  where d.user_id = auth.uid() and d.is_active
  order by d.created_at, d.name, d.id;
$function$

CREATE OR REPLACE FUNCTION public.get_my_role()
 RETURNS app_role
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
select role
from public.profiles
where user_id = auth.uid()
limit 1;
$function$

