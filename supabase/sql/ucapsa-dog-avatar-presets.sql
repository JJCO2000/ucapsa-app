-- UCAPSA — avatar local del perro (sin fotos, sin permisos de fototeca).
-- El usuario elige un estilo predefinido + color. La selección es acotada,
-- no admite texto libre ni archivos y puede mostrarse de forma segura en Ranking.

begin;

alter table public.dogs
  add column if not exists avatar_key text not null default 'dog_face',
  add column if not exists avatar_color text not null default '#F2E3C6';

alter table public.dogs
  drop constraint if exists dogs_avatar_key_check;
alter table public.dogs
  add constraint dogs_avatar_key_check
  check (avatar_key in (
    'dog_face',
    'dog_side',
    'poodle',
    'guide_dog',
    'service_dog',
    'paw',
    'cartoon_dog',
    'cartoon_dog_side',
    'cartoon_paw',
    'cartoon_bone'
  ));

alter table public.dogs
  drop constraint if exists dogs_avatar_color_check;
alter table public.dogs
  add constraint dogs_avatar_color_check
  check (avatar_color in (
    '#F2E3C6',
    '#7A151E',
    '#D4A62A',
    '#3C6FC9',
    '#4D857A',
    '#7A60A8',
    '#D8814C',
    '#C86B7A'
  ));

drop function if exists public.get_my_basic_dogs();
create function public.get_my_basic_dogs()
returns table (
  id uuid,
  name text,
  avatar_key text,
  avatar_color text,
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
    d.avatar_key,
    d.avatar_color,
    d.is_active,
    d.created_at,
    d.updated_at
  from public.dogs d
  where d.user_id = auth.uid()
    and d.is_active
  order by d.created_at, d.name, d.id;
$$;

revoke all on function public.get_my_basic_dogs() from public, anon;
grant execute on function public.get_my_basic_dogs() to authenticated;

drop function if exists public.get_my_basic_dog_profile(uuid);
create function public.get_my_basic_dog_profile(p_dog_id uuid)
returns table (
  id uuid,
  name text,
  avatar_key text,
  avatar_color text,
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
    d.avatar_key,
    d.avatar_color,
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

drop function if exists public.update_my_basic_dog_profile(uuid,text,text,date,text,numeric);
drop function if exists public.update_my_basic_dog_profile(uuid,text,text,date,text,numeric,text,text);

create function public.update_my_basic_dog_profile(
  p_dog_id uuid,
  p_name text,
  p_breed text default null,
  p_birth_date date default null,
  p_sex text default null,
  p_weight_kg numeric default null,
  p_avatar_key text default null,
  p_avatar_color text default null
)
returns table (
  id uuid,
  name text,
  avatar_key text,
  avatar_color text,
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

  if p_sex is not null and p_sex not in ('female', 'male', 'unknown') then
    raise exception 'Sexo no valido.';
  end if;

  if p_weight_kg is not null and p_weight_kg < 0 then
    raise exception 'El peso debe ser igual o mayor a cero.';
  end if;

  select
    coalesce(p_avatar_key, d.avatar_key),
    coalesce(p_avatar_color, d.avatar_color)
  into v_avatar_key, v_avatar_color
  from public.dogs d
  where d.id = p_dog_id
    and d.user_id = auth.uid()
    and d.is_active;

  if not found then
    raise exception 'No se encontro el perro.';
  end if;

  if v_avatar_key not in (
    'dog_face','dog_side','poodle','guide_dog','service_dog','paw',
    'cartoon_dog','cartoon_dog_side','cartoon_paw','cartoon_bone'
  ) then
    raise exception 'Avatar no valido.';
  end if;

  if v_avatar_color not in (
    '#F2E3C6','#7A151E','#D4A62A','#3C6FC9',
    '#4D857A','#7A60A8','#D8814C','#C86B7A'
  ) then
    raise exception 'Color de avatar no valido.';
  end if;

  return query
  update public.dogs d
  set
    name = btrim(p_name),
    avatar_key = v_avatar_key,
    avatar_color = v_avatar_color,
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
    d.avatar_key,
    d.avatar_color,
    d.breed,
    d.birth_date,
    d.sex,
    d.weight_kg,
    d.is_active,
    d.created_at,
    d.updated_at;
end;
$$;

revoke all on function public.update_my_basic_dog_profile(uuid,text,text,date,text,numeric,text,text) from public, anon;
grant execute on function public.update_my_basic_dog_profile(uuid,text,text,date,text,numeric,text,text) to authenticated;

create or replace view public.ucapsa_competition_leaderboard as
select
  r.season_id,
  r.season_code,
  r.season_name,
  r.season_status,
  r.season_starts_at,
  r.season_ends_at,
  row_number() over (
    partition by r.season_id
    order by
      coalesce(r.competitive_score, 0::numeric) desc,
      coalesce(r.command_attendances_count, 0::bigint) desc,
      coalesce(r.exam_points, 0::numeric) desc,
      r.dog_id
  ) as ranking_position,
  count(*) over (partition by r.season_id) as eligible_dogs_count,
  r.dog_id,
  r.dog_name,
  r.dog_is_active,
  r.competitive_score,
  r.constancy_points,
  r.command_attendances_count,
  r.member_visits_count,
  r.exam_points,
  r.admin_adjustment_points,
  r.required_exams_count,
  r.completed_required_exams_count,
  r.missing_required_exams_count,
  r.constancy_percentile,
  r.range_code,
  r.range_name,
  r.range_level,
  r.last_event_date,
  r.last_exam_published_at,
  r.last_adjustment_at,
  r.is_constancy_outstanding,
  r.constancy_population_count,
  r.has_sufficient_constancy_population,
  d.avatar_key as dog_avatar_key,
  d.avatar_color as dog_avatar_color
from public.ucapsa_competition_ranges r
join public.dogs d on d.id = r.dog_id
where r.is_ranking_eligible is true;

commit;
