-- UCAPSA — logros principales asociados al perro
--
-- Regla de producto:
--   * Puppy, Básico, Intermedio y Avanzado son logros formales del perro.
--   * una inscripción completada crea el logro formal correspondiente;
--   * si una finalización automática se revierte, solo se retira el logro creado
--     por esa inscripción; un logro manual de Admin se conserva;
--   * los logros históricos sin perro permanecen como legado hasta que puedan
--     atribuirse con certeza. Nunca se asignan a un perro ambiguo.

begin;

alter table public.user_achievements
  add column if not exists dog_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'user_achievements_dog_id_fkey'
      and conrelid = 'public.user_achievements'::regclass
  ) then
    alter table public.user_achievements
      add constraint user_achievements_dog_id_fkey
      foreign key (dog_id) references public.dogs(id) on delete cascade;
  end if;
end $$;

-- Primero recupera la relación exacta cuando el logro ya apunta a una inscripción.
update public.user_achievements ua
set dog_id = e.dog_id
from public.program_enrollments e
where ua.dog_id is null
  and ua.source_id = e.id
  and e.user_id = ua.user_id
  and e.dog_id is not null;

-- Un logro manual histórico solo puede atribuirse automáticamente cuando la cuenta
-- tiene exactamente un perro activo. Con dos o más perros se mantiene sin asignar.
with single_active_dog as (
  select user_id, min(id::text)::uuid as dog_id
  from public.dogs
  where is_active = true
  group by user_id
  having count(*) = 1
)
update public.user_achievements ua
set dog_id = d.dog_id
from single_active_dog d
where ua.user_id = d.user_id
  and ua.dog_id is null
  and ua.achievement_code in (
    'puppy_completed',
    'comandos_basico_completed',
    'comandos_medio_completed',
    'comandos_avanzado_completed'
  );

-- La unicidad anterior por cuenta impedía que dos perros del mismo tutor obtuvieran
-- la misma medalla. La reemplazamos por unicidad por perro, conservando una barrera
-- separada para filas históricas todavía no atribuidas.
alter table public.user_achievements
  drop constraint if exists user_achievements_user_id_achievement_code_key;

create unique index if not exists user_achievements_user_dog_achievement_uidx
  on public.user_achievements (user_id, dog_id, achievement_code)
  where dog_id is not null;

create unique index if not exists user_achievements_legacy_user_achievement_uidx
  on public.user_achievements (user_id, achievement_code)
  where dog_id is null;

create index if not exists user_achievements_dog_id_idx
  on public.user_achievements (dog_id, awarded_at desc)
  where dog_id is not null;

create or replace function public.ucapsa_program_completion_achievement_code(
  p_program_id uuid,
  p_program_level text
)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_program_code text;
begin
  select code into v_program_code
  from public.programs
  where id = p_program_id;

  if v_program_code = 'puppy' then
    return 'puppy_completed';
  end if;

  if v_program_code <> 'comandos' then
    return null;
  end if;

  if p_program_level in ('base', 'principiante') then
    return 'comandos_basico_completed';
  elsif p_program_level = 'medio' then
    return 'comandos_medio_completed';
  elsif p_program_level = 'avanzado' then
    return 'comandos_avanzado_completed';
  end if;

  return null;
end;
$$;

revoke all on function public.ucapsa_program_completion_achievement_code(uuid, text) from public;
revoke all on function public.ucapsa_program_completion_achievement_code(uuid, text) from anon;
revoke all on function public.ucapsa_program_completion_achievement_code(uuid, text) from authenticated;

create or replace function public.trg_ucapsa_sync_dog_program_achievement()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_achievement_code text;
begin
  v_achievement_code := public.ucapsa_program_completion_achievement_code(new.program_id, new.program_level);

  if v_achievement_code is null or new.dog_id is null then
    return new;
  end if;

  if new.status = 'completed'
     and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    insert into public.user_achievements (
      user_id,
      dog_id,
      achievement_code,
      source_type,
      source_id,
      awarded_at
    ) values (
      new.user_id,
      new.dog_id,
      v_achievement_code,
      'program_enrollment',
      new.id,
      coalesce(new.completed_at, new.updated_at, new.created_at, now())
    )
    on conflict (user_id, dog_id, achievement_code) where dog_id is not null
    do nothing;
  elsif tg_op = 'UPDATE'
    and old.status = 'completed'
    and new.status is distinct from 'completed' then
    delete from public.user_achievements ua
    where ua.user_id = new.user_id
      and ua.dog_id = new.dog_id
      and ua.achievement_code = v_achievement_code
      and ua.source_type = 'program_enrollment'
      and ua.source_id = new.id;
  end if;

  return new;
end;
$$;

revoke all on function public.trg_ucapsa_sync_dog_program_achievement() from public;
revoke all on function public.trg_ucapsa_sync_dog_program_achievement() from anon;
revoke all on function public.trg_ucapsa_sync_dog_program_achievement() from authenticated;

-- Sustituye el trigger histórico que otorgaba la medalla a la cuenta y usaba la
-- unicidad antigua (user_id, achievement_code). Dejarlo activo rompería nuevas
-- finalizaciones después de migrar la unicidad a nivel perro.
drop trigger if exists trg_ucapsa_award_program_achievement on public.program_enrollments;
revoke all on function public.ucapsa_award_program_achievement() from public;
revoke all on function public.ucapsa_award_program_achievement() from anon;
revoke all on function public.ucapsa_award_program_achievement() from authenticated;
revoke all on function public.ucapsa_achievement_code_for_enrollment(uuid) from public;
revoke all on function public.ucapsa_achievement_code_for_enrollment(uuid) from anon;
revoke all on function public.ucapsa_achievement_code_for_enrollment(uuid) from authenticated;

drop trigger if exists trg_ucapsa_sync_dog_program_achievement on public.program_enrollments;
create trigger trg_ucapsa_sync_dog_program_achievement
after insert or update of status on public.program_enrollments
for each row
execute function public.trg_ucapsa_sync_dog_program_achievement();

-- Convierte finalizaciones históricas ya vinculadas a perro en logros formales.
insert into public.user_achievements (
  user_id,
  dog_id,
  achievement_code,
  source_type,
  source_id,
  awarded_at
)
select
  e.user_id,
  e.dog_id,
  public.ucapsa_program_completion_achievement_code(e.program_id, e.program_level),
  'program_enrollment',
  e.id,
  coalesce(e.completed_at, e.updated_at, e.created_at, now())
from public.program_enrollments e
where e.status = 'completed'
  and e.dog_id is not null
  and public.ucapsa_program_completion_achievement_code(e.program_id, e.program_level) is not null
on conflict (user_id, dog_id, achievement_code) where dog_id is not null
do nothing;

commit;
