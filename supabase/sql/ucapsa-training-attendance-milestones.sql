-- UCAPSA — logros de entrenamiento que continúan después de Avanzado
--
-- Avanzado sigue siendo el nivel superior, pero no el final de los logros.
-- Los hitos de asistencia se otorgan por perro y son acumulativos en toda su
-- historia de clases. El antiguo "Avanzado completado" queda sólo como legado.

begin;

update public.achievement_definitions
set
  is_active = false,
  updated_at = clock_timestamp()
where code = 'comandos_avanzado_completed';

insert into public.achievement_definitions (
  code,
  title,
  description,
  unlocked_title,
  unlocked_description,
  icon,
  color_key,
  sort_order,
  is_active,
  created_at,
  updated_at
) values
  (
    'training_attendance_15',
    '15 clases juntos',
    'Alcanza 15 asistencias registradas con tu perro.',
    '15 clases juntos',
    'Ya sumaron 15 clases. Sigue entrenando: todavía hay más hitos por desbloquear.',
    'school',
    'blue',
    40,
    true,
    clock_timestamp(),
    clock_timestamp()
  ),
  (
    'training_attendance_30',
    '30 clases juntos',
    'Alcanza 30 asistencias registradas con tu perro.',
    '30 clases juntos',
    'Ya sumaron 30 clases. La constancia sigue creciendo.',
    'medal',
    'green',
    50,
    true,
    clock_timestamp(),
    clock_timestamp()
  ),
  (
    'training_attendance_50',
    '50 clases juntos',
    'Alcanza 50 asistencias registradas con tu perro.',
    '50 clases juntos',
    'Ya sumaron 50 clases. Este recorrido continúa más allá del nivel.',
    'trophy',
    'purple',
    60,
    true,
    clock_timestamp(),
    clock_timestamp()
  ),
  (
    'training_attendance_100',
    '100 clases juntos',
    'Alcanza 100 asistencias registradas con tu perro.',
    '100 clases juntos',
    'Ya sumaron 100 clases. Sigue mejorando y sumando historia con UCAPSA.',
    'star',
    'yellow',
    70,
    true,
    clock_timestamp(),
    clock_timestamp()
  )
on conflict (code) do update
set
  title = excluded.title,
  description = excluded.description,
  unlocked_title = excluded.unlocked_title,
  unlocked_description = excluded.unlocked_description,
  icon = excluded.icon,
  color_key = excluded.color_key,
  sort_order = excluded.sort_order,
  is_active = excluded.is_active,
  updated_at = clock_timestamp();

create or replace function public.ucapsa_award_training_attendance_milestones(
  p_user_id uuid,
  p_dog_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total integer;
  r record;
begin
  if p_user_id is null or p_dog_id is null then
    return;
  end if;

  select count(*)::integer
    into v_total
  from public.program_attendances a
  join public.program_enrollments e on e.id = a.enrollment_id
  where e.user_id = p_user_id
    and e.dog_id = p_dog_id;

  for r in
    select *
    from (values
      ('training_attendance_15'::text, 15),
      ('training_attendance_30'::text, 30),
      ('training_attendance_50'::text, 50),
      ('training_attendance_100'::text, 100)
    ) as milestones(code, threshold)
    where v_total >= threshold
  loop
    insert into public.user_achievements (
      user_id,
      dog_id,
      achievement_code,
      source_type,
      source_id,
      awarded_at,
      awarded_by
    )
    select
      p_user_id,
      p_dog_id,
      r.code,
      'attendance_milestone',
      null,
      clock_timestamp(),
      null
    where not exists (
      select 1
      from public.user_achievements ua
      where ua.user_id = p_user_id
        and ua.dog_id = p_dog_id
        and ua.achievement_code = r.code
    );
  end loop;
end;
$$;

revoke all on function public.ucapsa_award_training_attendance_milestones(uuid,uuid)
  from public, anon, authenticated;

create or replace function public.trg_ucapsa_award_training_attendance_milestones()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_dog_id uuid;
begin
  select e.user_id, e.dog_id
    into v_user_id, v_dog_id
  from public.program_enrollments e
  where e.id = new.enrollment_id;

  perform public.ucapsa_award_training_attendance_milestones(v_user_id, v_dog_id);
  return new;
exception
  when others then
    -- Una medalla nunca debe impedir registrar una asistencia real.
    raise warning 'UCAPSA training milestone award failed for attendance %: %', new.id, sqlerrm;
    return new;
end;
$$;

revoke all on function public.trg_ucapsa_award_training_attendance_milestones()
  from public, anon, authenticated;

drop trigger if exists trg_ucapsa_award_training_attendance_milestones
  on public.program_attendances;

create trigger trg_ucapsa_award_training_attendance_milestones
after insert on public.program_attendances
for each row execute function public.trg_ucapsa_award_training_attendance_milestones();

-- Backfill idempotente para la historia ya existente.
do $$
declare
  r record;
begin
  for r in
    select distinct e.user_id, e.dog_id
    from public.program_enrollments e
    join public.program_attendances a on a.enrollment_id = e.id
    where e.dog_id is not null
  loop
    perform public.ucapsa_award_training_attendance_milestones(r.user_id, r.dog_id);
  end loop;
end $$;

commit;
