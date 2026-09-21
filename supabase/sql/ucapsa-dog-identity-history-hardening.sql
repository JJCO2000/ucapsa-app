-- UCAPSA — complete dog identity/history hardening
--
-- Follow-up to ucapsa-profile-dog-integrity-hardening.sql:
-- - the full dog-profile editor updates dogs.name directly, so the canonical
--   rename trigger must also keep the legacy profiles.dog_name compatibility
--   field in sync when it actually referred to that dog;
-- - a dog's id/owner define historical identity across enrollments, visits,
--   achievements and competition records and must not be reassigned by normal
--   authenticated traffic, including Admin UI mistakes.

create or replace function public.sync_program_enrollment_dog_name()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.name is distinct from old.name then
    update public.program_enrollments
    set dog_name = new.name,
        updated_at = now()
    where dog_id = new.id;

    update public.profiles
    set dog_name = new.name,
        updated_at = now()
    where user_id = new.user_id
      and lower(btrim(coalesce(dog_name, ''))) = lower(btrim(old.name));
  end if;

  return new;
end;
$$;

revoke all on function public.sync_program_enrollment_dog_name()
  from public, anon, authenticated;

create or replace function public.prevent_unauthorized_dog_identity_changes()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- Trusted service/SQL maintenance remains available for exceptional repair.
  if auth.uid() is null then
    return new;
  end if;

  if old.id is distinct from new.id then
    raise exception 'No puedes cambiar la identidad del perro.';
  end if;

  if old.user_id is distinct from new.user_id then
    raise exception 'No puedes cambiar el propietario de un perro existente.';
  end if;

  return new;
end;
$$;

revoke all on function public.prevent_unauthorized_dog_identity_changes()
  from public, anon, authenticated;
grant execute on function public.prevent_unauthorized_dog_identity_changes()
  to service_role;

drop trigger if exists prevent_unauthorized_dog_identity_changes_trigger
  on public.dogs;

create trigger prevent_unauthorized_dog_identity_changes_trigger
before update on public.dogs
for each row
execute function public.prevent_unauthorized_dog_identity_changes();
