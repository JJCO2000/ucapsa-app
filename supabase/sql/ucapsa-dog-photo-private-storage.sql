-- UCAPSA — foto opcional del perro con almacenamiento privado.
-- Mantiene dog_profiles avanzado deshabilitado: expone sólo campos básicos ya visibles
-- y photo_path mediante RPCs autenticados con auth.uid().

begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'dog-profile-photos',
  'dog-profile-photos',
  false,
  5242880,
  array['image/jpeg','image/png','image/webp']::text[]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "dog_photos_owner_select" on storage.objects;
create policy "dog_photos_owner_select"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'dog-profile-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "dog_photos_owner_insert" on storage.objects;
create policy "dog_photos_owner_insert"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'dog-profile-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "dog_photos_owner_update" on storage.objects;
create policy "dog_photos_owner_update"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'dog-profile-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'dog-profile-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "dog_photos_owner_delete" on storage.objects;
create policy "dog_photos_owner_delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'dog-profile-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create or replace function public.get_my_basic_dog_profile(p_dog_id uuid)
returns table (
  id uuid,
  name text,
  photo_path text,
  breed text,
  birth_date date,
  sex text,
  weight_kg numeric,
  is_active boolean,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    d.id,
    d.name,
    d.photo_path,
    d.breed,
    d.birth_date,
    d.sex,
    d.weight_kg,
    d.is_active,
    d.created_at,
    d.updated_at
  from public.dogs d
  where d.id = p_dog_id
    and d.user_id = auth.uid()
    and d.is_active
  limit 1;
$$;

revoke all on function public.get_my_basic_dog_profile(uuid) from public, anon;
grant execute on function public.get_my_basic_dog_profile(uuid) to authenticated;

create or replace function public.update_my_basic_dog_profile(
  p_dog_id uuid,
  p_name text,
  p_breed text default null,
  p_birth_date date default null,
  p_sex text default null,
  p_weight_kg numeric default null
)
returns table (
  id uuid,
  name text,
  photo_path text,
  breed text,
  birth_date date,
  sex text,
  weight_kg numeric,
  is_active boolean,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'Sesion requerida.';
  end if;

  if nullif(btrim(coalesce(p_name, '')), '') is null then
    raise exception 'Escribe el nombre de tu perro.';
  end if;

  if p_birth_date is not null and p_birth_date > current_date then
    raise exception 'La fecha de nacimiento no puede ser futura.';
  end if;

  if p_sex is not null and p_sex not in ('female', 'male', 'unknown') then
    raise exception 'Sexo no valido.';
  end if;

  if p_weight_kg is not null and p_weight_kg < 0 then
    raise exception 'El peso debe ser igual o mayor a cero.';
  end if;

  return query
  update public.dogs d
  set
    name = btrim(p_name),
    breed = nullif(btrim(coalesce(p_breed, '')), ''),
    birth_date = p_birth_date,
    sex = p_sex,
    weight_kg = p_weight_kg,
    updated_at = clock_timestamp()
  where d.id = p_dog_id
    and d.user_id = auth.uid()
    and d.is_active
  returning
    d.id,
    d.name,
    d.photo_path,
    d.breed,
    d.birth_date,
    d.sex,
    d.weight_kg,
    d.is_active,
    d.created_at,
    d.updated_at;

  if not found then
    raise exception 'No se encontro el perro.';
  end if;
end;
$$;

revoke all on function public.update_my_basic_dog_profile(uuid,text,text,date,text,numeric) from public, anon;
grant execute on function public.update_my_basic_dog_profile(uuid,text,text,date,text,numeric) to authenticated;

create or replace function public.set_my_dog_photo_path(
  p_dog_id uuid,
  p_photo_path text
)
returns table (
  id uuid,
  name text,
  photo_path text,
  breed text,
  birth_date date,
  sex text,
  weight_kg numeric,
  is_active boolean,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_prefix text;
  v_path text;
begin
  if auth.uid() is null then
    raise exception 'Sesion requerida.';
  end if;

  v_path := nullif(btrim(coalesce(p_photo_path, '')), '');
  v_prefix := auth.uid()::text || '/' || p_dog_id::text || '/';

  if v_path is not null and left(v_path, length(v_prefix)) <> v_prefix then
    raise exception 'Ruta de foto no valida.';
  end if;

  return query
  update public.dogs d
  set
    photo_path = v_path,
    updated_at = clock_timestamp()
  where d.id = p_dog_id
    and d.user_id = auth.uid()
    and d.is_active
  returning
    d.id,
    d.name,
    d.photo_path,
    d.breed,
    d.birth_date,
    d.sex,
    d.weight_kg,
    d.is_active,
    d.created_at,
    d.updated_at;

  if not found then
    raise exception 'No se encontro el perro.';
  end if;
end;
$$;

revoke all on function public.set_my_dog_photo_path(uuid,text) from public, anon;
grant execute on function public.set_my_dog_photo_path(uuid,text) to authenticated;

commit;
