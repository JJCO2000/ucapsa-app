-- UCAPSA Rango 1 — snapshot multi-perro para visitas de socio
--
-- Regla canónica:
-- - memberships pertenece a la cuenta (user_id), no a un perro individual.
-- - member_visits conserva el hecho real de la visita.
-- - member_visit_dogs congela qué perros activos de esa cuenta recibieron crédito
--   en el momento de registrar la visita.
-- - No se reconstruye histórico aquí; sólo afecta visitas nuevas.

create or replace function public.ucapsa_snapshot_member_visit_dogs()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  insert into public.member_visit_dogs (
    visit_id,
    dog_id,
    credit_source,
    credited_at,
    credited_by
  )
  select
    new.id,
    d.id,
    'auto',
    clock_timestamp(),
    new.recorded_by
  from public.dogs d
  where d.user_id = new.user_id
    and d.is_active = true
  on conflict (visit_id, dog_id) do nothing;

  return new;
end;
$$;

revoke all on function public.ucapsa_snapshot_member_visit_dogs() from public, anon, authenticated;

drop trigger if exists trg_ucapsa_snapshot_member_visit_dogs
  on public.member_visits;

create trigger trg_ucapsa_snapshot_member_visit_dogs
after insert on public.member_visits
for each row execute function public.ucapsa_snapshot_member_visit_dogs();
