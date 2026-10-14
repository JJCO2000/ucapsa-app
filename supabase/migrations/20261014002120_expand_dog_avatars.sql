-- Ampliar catálogo de avatares sin borrar los 10 existentes.
-- Aplicar coordinadamente con los clientes nuevos; no toca rangos ni historial.
begin;
alter table public.dogs drop constraint if exists dogs_avatar_key_check;
alter table public.dogs add constraint dogs_avatar_key_check check (avatar_key in (
  'dog_face','dog_side','poodle','guide_dog','service_dog','paw',
  'cartoon_dog','cartoon_dog_side','cartoon_paw','cartoon_bone',
  'dog_heart','dog_star','dog_sun','dog_moon','dog_play'
));

create or replace function public.update_my_basic_dog_profile(
  p_dog_id uuid, p_name text, p_breed text default null,
  p_birth_date date default null, p_sex text default null, p_weight_kg numeric default null,
  p_avatar_key text default null, p_avatar_color text default null
)
returns table(
  id uuid, name text, avatar_key text, avatar_color text, breed text, birth_date date,
  sex text, weight_kg numeric, is_active boolean, created_at timestamptz, updated_at timestamptz
)
language plpgsql security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_avatar_key text;
  v_avatar_color text;
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
  if p_sex is not null and p_sex not in ('female','male','unknown') then
    raise exception 'Sexo no valido.';
  end if;
  if p_weight_kg is not null and p_weight_kg < 0 then
    raise exception 'El peso debe ser igual o mayor a cero.';
  end if;
  select coalesce(p_avatar_key, d.avatar_key), coalesce(p_avatar_color, d.avatar_color)
    into v_avatar_key, v_avatar_color from public.dogs d
    where d.id = p_dog_id and d.user_id = auth.uid() and d.is_active;
  if not found then
    raise exception 'No se encontro el perro.';
  end if;
  if v_avatar_key not in (
    'dog_face','dog_side','poodle','guide_dog','service_dog','paw',
    'cartoon_dog','cartoon_dog_side','cartoon_paw','cartoon_bone',
    'dog_heart','dog_star','dog_sun','dog_moon','dog_play'
  ) then
    raise exception 'Avatar no valido.';
  end if;
  if v_avatar_color not in (
    '#F2E3C6','#7A151E','#D4A62A','#3C6FC9','#4D857A','#7A60A8','#D8814C','#C86B7A'
  ) then
    raise exception 'Color de avatar no valido.';
  end if;
  return query update public.dogs d set
    name = btrim(p_name),
    avatar_key = v_avatar_key, avatar_color = v_avatar_color,
    breed = nullif(btrim(coalesce(p_breed, '')), ''),
    birth_date = p_birth_date, sex = p_sex, weight_kg = p_weight_kg,
    updated_at = clock_timestamp()
  where d.id = p_dog_id and d.user_id = auth.uid() and d.is_active
  returning d.id,d.name,d.avatar_key,d.avatar_color,d.breed,d.birth_date,d.sex,d.weight_kg,d.is_active,d.created_at,d.updated_at;
end;
$function$;
commit;
