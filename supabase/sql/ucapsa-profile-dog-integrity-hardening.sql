-- UCAPSA — integridad de perfiles y perros
--
-- Hallazgos cerrados:
-- 1) authenticated conservaba INSERT directo sobre dogs, por lo que podía
--    saltarse las validaciones de create_my_basic_dog();
-- 2) el RPC admin_create_basic_dog no aplicaba las mismas reglas de nombre;
-- 3) profiles permitía UPDATE del dueño sobre columnas históricas/administrativas
--    que no pertenecen al editor de perfil (id, created_at y flags legacy de baja).
--
-- Las reglas de identidad deben vivir en PostgreSQL, no sólo en la UI.

do $ucapsa$
begin
  if exists (
    select 1
    from public.dogs
    where char_length(btrim(name)) > 80
       or name ~ '[[:cntrl:]]'
       or btrim(name) = ''
  ) then
    raise exception 'Dog-name hardening aborted: existing invalid dog names require review.';
  end if;

  if exists (
    select 1
    from public.dogs
    where is_active = true
    group by user_id, lower(btrim(name))
    having count(*) > 1
  ) then
    raise exception 'Dog-name hardening aborted: duplicate active dog names require review.';
  end if;
end;
$ucapsa$;

alter table public.dogs
  drop constraint if exists dogs_name_length_check;
alter table public.dogs
  add constraint dogs_name_length_check
  check (char_length(btrim(name)) between 1 and 80);

alter table public.dogs
  drop constraint if exists dogs_name_no_control_chars_check;
alter table public.dogs
  add constraint dogs_name_no_control_chars_check
  check (name !~ '[[:cntrl:]]');

create unique index if not exists dogs_user_active_normalized_name_unique_idx
  on public.dogs (user_id, lower(btrim(name)))
  where is_active = true;

-- La creación canónica ya existe por RPC (cliente y Admin). Quitar INSERT directo
-- evita que un cliente salte las reglas anteriores mediante PostgREST.
revoke insert on table public.dogs from authenticated;

create or replace function public.admin_create_basic_dog(
  p_user_id uuid,
  p_name text
)
returns table(
  id uuid,
  name text,
  is_active boolean,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_name text := btrim(coalesce(p_name, ''));
  v_dog public.dogs%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Solo administradores pueden registrar perros para clientes.';
  end if;

  if p_user_id is null or not exists (
    select 1
    from public.profiles p
    where p.user_id = p_user_id
      and p.role in ('client', 'member')
  ) then
    raise exception 'Cliente no encontrado.';
  end if;

  if v_name = '' then
    raise exception 'El nombre del perro es obligatorio.';
  end if;
  if length(v_name) > 80 then
    raise exception 'El nombre es demasiado largo.';
  end if;
  if v_name ~ '[[:cntrl:]]' then
    raise exception 'El nombre contiene caracteres no permitidos.';
  end if;

  if exists (
    select 1
    from public.dogs d
    where d.user_id = p_user_id
      and d.is_active = true
      and lower(btrim(d.name)) = lower(v_name)
  ) then
    raise exception 'El cliente ya tiene un perro activo con ese nombre.';
  end if;

  insert into public.dogs (user_id, name, is_active)
  values (p_user_id, v_name, true)
  returning * into v_dog;

  return query
  select v_dog.id, v_dog.name, v_dog.is_active, v_dog.created_at, v_dog.updated_at;
end;
$$;

revoke all on function public.admin_create_basic_dog(uuid, text)
  from public, anon;
grant execute on function public.admin_create_basic_dog(uuid, text)
  to authenticated, service_role;

create or replace function public.prevent_unauthorized_profile_changes()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- SQL Editor / trusted service maintenance remains available.
  if auth.uid() is null then
    return new;
  end if;

  -- Stable row identity and historical creation time are not editable profile data.
  if old.id is distinct from new.id then
    raise exception 'No puedes cambiar el id del perfil.';
  end if;
  if old.user_id is distinct from new.user_id then
    raise exception 'No puedes cambiar el user_id del perfil.';
  end if;
  if old.created_at is distinct from new.created_at then
    raise exception 'No puedes cambiar la fecha de creación del perfil.';
  end if;

  -- Account deletion has its own canonical ledger/RPC. These columns are legacy
  -- compatibility fields and must not become a second mutable workflow.
  if old.deletion_requested_at is distinct from new.deletion_requested_at
     or old.deletion_request_reason is distinct from new.deletion_request_reason then
    raise exception 'La baja de cuenta debe gestionarse mediante el flujo canónico.';
  end if;

  -- Email remains synchronized from auth.users for normal users.
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
    ) and not public.is_super_admin() then
      raise exception 'Solo super_admin puede modificar roles administrativos.';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.prevent_unauthorized_profile_changes()
  from public, anon, authenticated;
grant execute on function public.prevent_unauthorized_profile_changes()
  to service_role;
