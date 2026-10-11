-- UCAPSA private dog profile photos
-- Owner-only storage. Photos are not public leaderboard assets.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'dog-photos',
  'dog-photos',
  false,
  3145728,
  array['image/jpeg','image/png','image/webp']::text[]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists dog_photos_owner_select on storage.objects;
create policy dog_photos_owner_select
on storage.objects
for select
to authenticated
using (
  bucket_id = 'dog-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists dog_photos_owner_insert on storage.objects;
create policy dog_photos_owner_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'dog-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists dog_photos_owner_update on storage.objects;
create policy dog_photos_owner_update
on storage.objects
for update
to authenticated
using (
  bucket_id = 'dog-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'dog-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists dog_photos_owner_delete on storage.objects;
create policy dog_photos_owner_delete
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'dog-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create or replace function public.get_my_dog_photo_paths()
returns table(dog_id uuid, photo_path text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select d.id, d.photo_path
  from public.dogs d
  where d.user_id = auth.uid()
    and d.is_active
  order by d.created_at, d.id;
$$;

create or replace function public.set_my_dog_photo_path(
  p_dog_id uuid,
  p_photo_path text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_path text := nullif(btrim(coalesce(p_photo_path, '')), '');
  v_prefix text;
begin
  if v_user_id is null then
    raise exception 'Sesion requerida.';
  end if;

  if not exists (
    select 1
    from public.dogs d
    where d.id = p_dog_id
      and d.user_id = v_user_id
      and d.is_active
  ) then
    raise exception 'No se encontro el perro.';
  end if;

  if v_path is not null then
    v_prefix := v_user_id::text || '/' || p_dog_id::text || '/';
    if left(v_path, length(v_prefix)) <> v_prefix then
      raise exception 'Ruta de foto no valida.';
    end if;
    if v_path !~* '\.(jpe?g|png|webp)$' then
      raise exception 'Formato de foto no valido.';
    end if;
  end if;

  update public.dogs
  set photo_path = v_path,
      updated_at = clock_timestamp()
  where id = p_dog_id
    and user_id = v_user_id;
end;
$$;

revoke all on function public.get_my_dog_photo_paths() from public, anon;
grant execute on function public.get_my_dog_photo_paths() to authenticated;

revoke all on function public.set_my_dog_photo_path(uuid, text) from public, anon;
grant execute on function public.set_my_dog_photo_path(uuid, text) to authenticated;
