-- UCAPSA — invariante de Comandos: un solo horario lógico
--
-- Comandos tiene un único schedule_id compartido por Básico, Intermedio y
-- Avanzado. Los niveles viven en program_enrollments.program_level; no crean
-- horarios adicionales. Los cambios de día/hora se versionan sobre el mismo
-- schedule_id mediante program_schedule_versions.

create or replace function public.enforce_single_commands_schedule()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_program_code text;
begin
  select p.code
    into v_program_code
  from public.programs p
  where p.id = new.program_id;

  if v_program_code = 'comandos'
     and exists (
       select 1
       from public.program_schedules ps
       join public.programs p on p.id = ps.program_id
       where p.code = 'comandos'
         and ps.id <> new.id
     ) then
    raise exception 'Comandos usa un solo horario lógico. Modifica/versiona el horario existente.'
      using errcode = '23505';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_single_commands_schedule_trigger
  on public.program_schedules;

create trigger enforce_single_commands_schedule_trigger
before insert or update of program_id
on public.program_schedules
for each row
execute function public.enforce_single_commands_schedule();

comment on function public.enforce_single_commands_schedule() is
  'Impide crear un segundo program_schedules para Comandos; niveles y cambios de hora se resuelven sobre el schedule compartido.';
