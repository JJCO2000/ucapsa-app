-- UCAPSA — dog/profile identity and legacy-name integrity hardening
--
-- Goals:
-- 1) enforce at PostgreSQL the same dog-name invariants already expected by
--    create/rename RPCs, so direct table writes cannot bypass them;
-- 2) keep the legacy profiles.dog_name compatibility field synchronized when
--    a dog is renamed through the full profile editor;
-- 3) prevent authenticated callers from reassigning dog identity/history;
-- 4) stop clients from mutating retired account-deletion flags or immutable
--    profile identity metadata through the broad profiles UPDATE policy.

do $ucapsa$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.dogs'::regclass
      and conname = 'dogs_name_max_length'
  ) then
    alter table public.dogs
      add constraint dogs_name_max_length
      check (char_length(btrim(name)) <= 80);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.dogs'::regclass
      and conname = 'dogs_name_no_control_chars'
  ) then
    alter table public.dogs
      add constraint dogs_name_no_control_chars
      check (name !~ '[[:cntrl:]]');
  end if;
end;
$ucapsa$;

create unique index if not exists dogs_active_user_normalized_name_uidx
  on public.dogs (user_id, lower(btrim(name)))
  where is_active = true;

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

    -- profiles.dog_name is retained only as a compatibility field for older
    -- screens/data. Update it only when it actually pointed at this dog.
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
  -- SQL editor/service-role maintenance remains available for exceptional
  -- repair. Normal authenticated app traffic cannot move historical identity.
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

drop trigger if exists prevent_unauthorized_dog_identity_changes_trigger
  on public.dogs;

create trigger prevent_unauthorized_dog_identity_changes_trigger
before update on public.dogs
for each row
execute function public.prevent_unauthorized_dog_identity_changes();

create or replace function public.prevent_unauthorized_profile_changes()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- SQL editor/service-role maintenance is still the escape hatch for the
  -- first super_admin and exceptional repairs.
  if auth.uid() is null then
    return new;
  end if;

  if old.id is distinct from new.id then
    raise exception 'No puedes cambiar la identidad del perfil.';
  end if;

  if old.user_id is distinct from new.user_id then
    raise exception 'No puedes cambiar el user_id del perfil.';
  end if;

  if old.created_at is distinct from new.created_at then
    raise exception 'No puedes cambiar la fecha de creación del perfil.';
  end if;

  -- These columns are retired compatibility fields. Account deletion now has
  -- account_deletion_requests as its SSOT and must not be forged through
  -- direct profile UPDATEs.
  if old.deletion_requested_at is distinct from new.deletion_requested_at
     or old.deletion_request_reason is distinct from new.deletion_request_reason then
    raise exception 'El estado de eliminación de cuenta se gestiona por el flujo canónico.';
  end if;

  -- A normal user never edits the profile copy of email directly. Email
  -- changes go through Supabase Auth and their confirmation flow.
  if old.email is distinct from new.email and not public.is_admin() then
    raise exception 'No puedes cambiar el email del perfil.';
  end if;

  if old.role is distinct from new.role then
    if not public.is_admin() then
      raise exception 'No tienes permiso para cambiar roles.';
    end if;

    if (
      old.role in ('admin', 'super_admin')
      or new.role in ('admin', 'super_admin')
    )
    and not public.is_super_admin() then
      raise exception 'Solo super_admin puede modificar roles administrativos.';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.prevent_unauthorized_profile_changes()
  from public, anon, authenticated;
