-- UCAPSA Rango 1 — state machine de temporadas
--
-- Transiciones permitidas:
--   draft -> active
--   active -> closed
--   closed -> reopened
--   reopened -> closed
-- Mantener el mismo estado siempre es valido para editar metadatos permitidos.
-- Solo un borrador puede eliminarse.

create or replace function public.ucapsa_guard_season_state_machine()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft' then
      raise exception 'Solo una temporada UCAPSA en borrador puede eliminarse.'
        using errcode = '55000';
    end if;
    return old;
  end if;

  if new.status = old.status then
    return new;
  end if;

  if (old.status = 'draft' and new.status = 'active')
    or (old.status = 'active' and new.status = 'closed')
    or (old.status = 'closed' and new.status = 'reopened')
    or (old.status = 'reopened' and new.status = 'closed') then
    return new;
  end if;

  raise exception 'Transicion de temporada UCAPSA invalida: % -> %', old.status, new.status
    using errcode = '55000';
end;
$$;

revoke all on function public.ucapsa_guard_season_state_machine()
  from public, anon, authenticated;

drop trigger if exists trg_ucapsa_guard_season_state_machine
  on public.ucapsa_competition_seasons;
create trigger trg_ucapsa_guard_season_state_machine
before update or delete on public.ucapsa_competition_seasons
for each row execute function public.ucapsa_guard_season_state_machine();
