-- UCAPSA — acceso de socio por perro + entrenamiento ilimitado
--
-- La membresía sigue perteneciendo a la cuenta. Esta capa modela qué perros
-- están cubiertos (todos por defecto) y separa el acceso ilimitado de socio
-- de una tarjeta finita de clases.
--
-- Invariantes:
--   * cuenta socio activa -> perros activos cubiertos por defecto;
--   * un Admin puede excluir/reincluir un perro como excepción;
--   * un perro cubierto tiene una sola etapa de entrenamiento de membresía activa;
--   * si ya cursaba una tarjeta, conserva programa/nivel al convertirse en socio;
--   * si no tenía historia, inicia en Comandos · Básico;
--   * cancelar membresía retira acceso ilimitado, pero nunca borra nivel/historia.

begin;

alter table public.program_enrollments
  add column if not exists access_mode text not null default 'card',
  add column if not exists membership_id uuid references public.memberships(id) on delete set null;

alter table public.program_enrollments
  drop constraint if exists program_enrollments_access_mode_check;
alter table public.program_enrollments
  add constraint program_enrollments_access_mode_check
  check (access_mode in ('card', 'membership'));

alter table public.program_enrollments
  drop constraint if exists program_enrollments_membership_access_check;
alter table public.program_enrollments
  add constraint program_enrollments_membership_access_check
  check (
    (access_mode = 'card' and membership_id is null)
    or (access_mode = 'membership' and membership_id is not null)
  );

create unique index if not exists program_enrollments_one_active_membership_stage_per_dog_idx
  on public.program_enrollments(dog_id)
  where access_mode = 'membership'
    and status = 'active'
    and dog_id is not null;

create index if not exists program_enrollments_membership_id_idx
  on public.program_enrollments(membership_id)
  where membership_id is not null;

create table if not exists public.membership_dog_access (
  id uuid primary key default gen_random_uuid(),
  membership_id uuid not null references public.memberships(id) on delete cascade,
  user_id uuid not null,
  dog_id uuid not null references public.dogs(id) on delete cascade,
  is_covered boolean not null default true,
  changed_by uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (membership_id, dog_id)
);

create index if not exists membership_dog_access_user_idx
  on public.membership_dog_access(user_id);
create index if not exists membership_dog_access_dog_idx
  on public.membership_dog_access(dog_id);

alter table public.membership_dog_access enable row level security;

drop policy if exists "membership_dog_access_owner_select" on public.membership_dog_access;
create policy "membership_dog_access_owner_select"
on public.membership_dog_access
for select
to authenticated
using (user_id = auth.uid() or public.is_ucapsa_admin());

revoke insert, update, delete on table public.membership_dog_access from authenticated;
grant select on table public.membership_dog_access to authenticated, service_role;

create or replace function public.ucapsa_validate_membership_dog_access()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_membership_user uuid;
  v_dog_user uuid;
begin
  select m.user_id into v_membership_user
  from public.memberships m
  where m.id = new.membership_id;

  select d.user_id into v_dog_user
  from public.dogs d
  where d.id = new.dog_id;

  if v_membership_user is null or v_dog_user is null then
    raise exception 'Membresía o perro no encontrado.';
  end if;

  if v_membership_user is distinct from new.user_id
     or v_dog_user is distinct from new.user_id then
    raise exception 'La membresía, la cuenta y el perro deben pertenecer al mismo usuario.'
      using errcode = '23514';
  end if;

  new.updated_at := clock_timestamp();
  return new;
end;
$$;

revoke all on function public.ucapsa_validate_membership_dog_access()
  from public, anon, authenticated;

drop trigger if exists trg_ucapsa_validate_membership_dog_access
  on public.membership_dog_access;
create trigger trg_ucapsa_validate_membership_dog_access
before insert or update of membership_id, user_id, dog_id, is_covered
on public.membership_dog_access
for each row execute function public.ucapsa_validate_membership_dog_access();

create or replace function public.ucapsa_pick_active_program_schedule(
  p_program_id uuid
)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select s.id
  from public.program_schedules s
  join lateral public.get_effective_program_schedule(
    s.id,
    (clock_timestamp() at time zone 'America/Mexico_City')::date
  ) effective on true
  where s.program_id = p_program_id
    and effective.is_active = true
  order by effective.sequence_order, effective.day_of_week, effective.start_time
  limit 1;
$$;

revoke all on function public.ucapsa_pick_active_program_schedule(uuid)
  from public, anon, authenticated;

create or replace function public.ucapsa_ensure_member_dog_training_access(
  p_membership_id uuid,
  p_dog_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_membership public.memberships%rowtype;
  v_dog public.dogs%rowtype;
  v_access public.membership_dog_access%rowtype;
  v_existing public.program_enrollments%rowtype;
  v_reference public.program_enrollments%rowtype;
  v_program_id uuid;
  v_schedule_id uuid;
  v_level text;
  v_program_code text;
  v_new_id uuid;
begin
  select * into v_membership
  from public.memberships
  where id = p_membership_id;

  if not found or v_membership.status <> 'active' then
    return null;
  end if;

  select * into v_dog
  from public.dogs
  where id = p_dog_id
    and user_id = v_membership.user_id
    and is_active = true;

  if not found then
    return null;
  end if;

  select * into v_access
  from public.membership_dog_access
  where membership_id = p_membership_id
    and dog_id = p_dog_id;

  if not found or not v_access.is_covered then
    return null;
  end if;

  select * into v_existing
  from public.program_enrollments e
  where e.dog_id = p_dog_id
    and e.user_id = v_membership.user_id
    and e.access_mode = 'membership'
    and e.membership_id = p_membership_id
    and e.status = 'active'
  order by e.created_at desc
  limit 1;

  if found then
    return v_existing.id;
  end if;

  -- Reactivar la última etapa de membresía cuando sólo se había retirado el
  -- acceso por cancelación de membresía o cobertura.
  select * into v_existing
  from public.program_enrollments e
  where e.dog_id = p_dog_id
    and e.user_id = v_membership.user_id
    and e.access_mode = 'membership'
    and e.membership_id = p_membership_id
    and e.status = 'cancelled'
  order by e.cancelled_at desc nulls last, e.created_at desc
  limit 1;

  if found then
    update public.program_enrollments
    set
      status = 'active',
      cancelled_at = null,
      updated_at = clock_timestamp()
    where id = v_existing.id;
    return v_existing.id;
  end if;

  -- Conserva la etapa real más reciente del perro. Si existe una tarjeta activa,
  -- deja de gobernar acceso al convertirse en socio, pero su historial queda.
  select * into v_reference
  from public.program_enrollments e
  where e.dog_id = p_dog_id
    and e.user_id = v_membership.user_id
    and e.access_mode = 'card'
  order by
    case when e.status = 'active' then 0 else 1 end,
    e.created_at desc
  limit 1;

  if found then
    v_program_id := v_reference.program_id;
    v_schedule_id := v_reference.schedule_id;
    v_level := v_reference.program_level;

    update public.program_enrollments
    set
      status = 'cancelled',
      cancelled_at = coalesce(cancelled_at, clock_timestamp()),
      updated_at = clock_timestamp(),
      notes = concat_ws(
        E'\n',
        nullif(notes, ''),
        'Tarjeta cerrada al comenzar acceso ilimitado de socio.'
      )
    where id = v_reference.id
      and v_reference.status = 'active';
  else
    select p.id into v_program_id
    from public.programs p
    where p.code = 'comandos'
      and p.is_active = true
    order by p.created_at asc
    limit 1;

    if v_program_id is null then
      raise exception 'No existe Comandos activo para asignar al nuevo socio.';
    end if;

    v_schedule_id := public.ucapsa_pick_active_program_schedule(v_program_id);
    v_level := 'principiante';
  end if;

  if v_schedule_id is null then
    v_schedule_id := public.ucapsa_pick_active_program_schedule(v_program_id);
  end if;

  if v_schedule_id is null then
    raise exception 'No hay horario activo para el entrenamiento del socio.';
  end if;

  select p.code into v_program_code
  from public.programs p
  where p.id = v_program_id;

  if v_program_code = 'comandos' and v_level not in ('principiante', 'medio', 'avanzado') then
    v_level := 'principiante';
  elsif v_program_code = 'puppy' then
    v_level := 'base';
  end if;

  insert into public.program_enrollments (
    user_id,
    program_id,
    schedule_id,
    dog_id,
    dog_name,
    physical_card_number,
    status,
    attendances_count,
    program_level,
    last_attendance_at,
    notes,
    started_at,
    card_started_on,
    card_expires_on,
    requirements_met_at,
    access_mode,
    membership_id
  ) values (
    v_membership.user_id,
    v_program_id,
    v_schedule_id,
    p_dog_id,
    v_dog.name,
    null,
    'active',
    0,
    v_level,
    null,
    'Acceso ilimitado por membresía UCAPSA.',
    (clock_timestamp() at time zone 'America/Mexico_City')::date,
    null,
    null,
    null,
    'membership',
    p_membership_id
  )
  returning id into v_new_id;

  return v_new_id;
end;
$$;

revoke all on function public.ucapsa_ensure_member_dog_training_access(uuid,uuid)
  from public, anon, authenticated;

create or replace function public.ucapsa_sync_membership_dog_access(
  p_membership_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_membership public.memberships%rowtype;
  r record;
begin
  select * into v_membership
  from public.memberships
  where id = p_membership_id;

  if not found then
    return;
  end if;

  if v_membership.status = 'active' then
    -- Sólo inserta faltantes: una exclusión explícita (is_covered=false) se respeta.
    insert into public.membership_dog_access (
      membership_id,
      user_id,
      dog_id,
      is_covered,
      changed_by
    )
    select
      v_membership.id,
      v_membership.user_id,
      d.id,
      true,
      auth.uid()
    from public.dogs d
    where d.user_id = v_membership.user_id
      and d.is_active = true
    on conflict (membership_id, dog_id) do nothing;

    for r in
      select a.dog_id
      from public.membership_dog_access a
      join public.dogs d on d.id = a.dog_id
      where a.membership_id = v_membership.id
        and a.user_id = v_membership.user_id
        and a.is_covered = true
        and d.is_active = true
    loop
      perform public.ucapsa_ensure_member_dog_training_access(v_membership.id, r.dog_id);
    end loop;
  else
    update public.program_enrollments e
    set
      status = 'cancelled',
      cancelled_at = coalesce(e.cancelled_at, clock_timestamp()),
      updated_at = clock_timestamp()
    where e.membership_id = v_membership.id
      and e.access_mode = 'membership'
      and e.status = 'active';
  end if;
end;
$$;

revoke all on function public.ucapsa_sync_membership_dog_access(uuid)
  from public, anon, authenticated;

create or replace function public.trg_ucapsa_sync_membership_dog_access()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT'
     or old.status is distinct from new.status then
    perform public.ucapsa_sync_membership_dog_access(new.id);
  end if;
  return new;
end;
$$;

revoke all on function public.trg_ucapsa_sync_membership_dog_access()
  from public, anon, authenticated;

drop trigger if exists trg_ucapsa_sync_membership_dog_access on public.memberships;
create trigger trg_ucapsa_sync_membership_dog_access
after insert or update of status on public.memberships
for each row execute function public.trg_ucapsa_sync_membership_dog_access();

create or replace function public.trg_ucapsa_cover_new_member_dog()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_membership_id uuid;
begin
  if new.is_active is not true then
    return new;
  end if;

  select m.id into v_membership_id
  from public.memberships m
  where m.user_id = new.user_id
    and m.status = 'active'
  order by m.created_at desc
  limit 1;

  if v_membership_id is null then
    return new;
  end if;

  insert into public.membership_dog_access (
    membership_id,
    user_id,
    dog_id,
    is_covered,
    changed_by
  ) values (
    v_membership_id,
    new.user_id,
    new.id,
    true,
    auth.uid()
  )
  on conflict (membership_id, dog_id) do nothing;

  perform public.ucapsa_ensure_member_dog_training_access(v_membership_id, new.id);
  return new;
end;
$$;

revoke all on function public.trg_ucapsa_cover_new_member_dog()
  from public, anon, authenticated;

drop trigger if exists trg_ucapsa_cover_new_member_dog on public.dogs;
create trigger trg_ucapsa_cover_new_member_dog
after insert on public.dogs
for each row execute function public.trg_ucapsa_cover_new_member_dog();

create or replace function public.admin_set_membership_dog_coverage(
  p_membership_id uuid,
  p_dog_id uuid,
  p_is_covered boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_membership public.memberships%rowtype;
  v_dog public.dogs%rowtype;
begin
  if not public.is_ucapsa_admin() then
    raise exception 'Solo Admin puede cambiar la cobertura de un perro.'
      using errcode = '42501';
  end if;

  select * into v_membership
  from public.memberships
  where id = p_membership_id;

  select * into v_dog
  from public.dogs
  where id = p_dog_id;

  if v_membership.id is null
     or v_dog.id is null
     or v_membership.user_id is distinct from v_dog.user_id then
    raise exception 'La membresía y el perro no corresponden a la misma cuenta.'
      using errcode = '22023';
  end if;

  insert into public.membership_dog_access (
    membership_id,
    user_id,
    dog_id,
    is_covered,
    changed_by
  ) values (
    v_membership.id,
    v_membership.user_id,
    v_dog.id,
    p_is_covered,
    auth.uid()
  )
  on conflict (membership_id, dog_id) do update
  set
    is_covered = excluded.is_covered,
    changed_by = auth.uid(),
    updated_at = clock_timestamp();

  if p_is_covered then
    if v_membership.status = 'active' then
      perform public.ucapsa_ensure_member_dog_training_access(v_membership.id, v_dog.id);
    end if;
  else
    update public.program_enrollments e
    set
      status = 'cancelled',
      cancelled_at = coalesce(e.cancelled_at, clock_timestamp()),
      updated_at = clock_timestamp()
    where e.membership_id = v_membership.id
      and e.dog_id = v_dog.id
      and e.access_mode = 'membership'
      and e.status = 'active';
  end if;

  insert into public.admin_audit_logs (
    admin_user_id,
    action,
    entity_type,
    entity_id,
    details
  ) values (
    auth.uid(),
    'membership_dog.coverage',
    'dog',
    v_dog.id,
    jsonb_build_object(
      'membership_id', v_membership.id,
      'user_id', v_membership.user_id,
      'is_covered', p_is_covered
    )
  );
end;
$$;

revoke all on function public.admin_set_membership_dog_coverage(uuid,uuid,boolean)
  from public, anon;
grant execute on function public.admin_set_membership_dog_coverage(uuid,uuid,boolean)
  to authenticated, service_role;

create or replace function public.admin_set_member_dog_training_stage(
  p_membership_id uuid,
  p_dog_id uuid,
  p_program_code text,
  p_program_level text,
  p_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_membership public.memberships%rowtype;
  v_dog public.dogs%rowtype;
  v_program_id uuid;
  v_schedule_id uuid;
  v_current public.program_enrollments%rowtype;
  v_level text;
  v_new_id uuid;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_codes text[] := array[]::text[];
  v_code text;
begin
  if not public.is_ucapsa_admin() then
    raise exception 'Solo Admin puede cambiar el nivel de entrenamiento de un socio.'
      using errcode = '42501';
  end if;

  select * into v_membership
  from public.memberships
  where id = p_membership_id
    and status = 'active';

  select * into v_dog
  from public.dogs
  where id = p_dog_id
    and is_active = true;

  if v_membership.id is null
     or v_dog.id is null
     or v_membership.user_id is distinct from v_dog.user_id then
    raise exception 'Membresía activa y perro de la misma cuenta son obligatorios.'
      using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.membership_dog_access a
    where a.membership_id = v_membership.id
      and a.dog_id = v_dog.id
      and a.is_covered = true
  ) then
    raise exception 'Ese perro no está cubierto por la membresía.'
      using errcode = '22023';
  end if;

  if lower(btrim(p_program_code)) = 'puppy' then
    v_level := 'base';
  elsif lower(btrim(p_program_code)) = 'comandos'
    and lower(btrim(p_program_level)) in ('principiante', 'medio', 'avanzado') then
    v_level := lower(btrim(p_program_level));
  else
    raise exception 'Etapa de entrenamiento no válida.'
      using errcode = '22023';
  end if;

  select p.id into v_program_id
  from public.programs p
  where p.code = lower(btrim(p_program_code))
    and p.is_active = true
  order by p.created_at asc
  limit 1;

  if v_program_id is null then
    raise exception 'Programa activo no encontrado.'
      using errcode = '22023';
  end if;

  select * into v_current
  from public.program_enrollments e
  where e.membership_id = v_membership.id
    and e.dog_id = v_dog.id
    and e.access_mode = 'membership'
    and e.status = 'active'
  order by e.created_at desc
  limit 1;

  if found
     and v_current.program_id = v_program_id
     and v_current.program_level = v_level then
    return v_current.id;
  end if;

  if found
     and lower(btrim(p_program_code)) = 'comandos'
     and v_current.program_id = v_program_id then
    v_schedule_id := v_current.schedule_id;
  else
    v_schedule_id := public.ucapsa_pick_active_program_schedule(v_program_id);
  end if;

  if v_schedule_id is null then
    raise exception 'No hay horario activo para esa etapa.'
      using errcode = '22023';
  end if;

  if found then
    update public.program_enrollments
    set
      status = 'completed',
      completed_at = coalesce(completed_at, clock_timestamp()),
      updated_at = clock_timestamp(),
      notes = concat_ws(
        E'\n',
        nullif(notes, ''),
        coalesce(v_reason, 'Etapa cerrada por cambio administrativo de nivel de socio.')
      )
    where id = v_current.id;
  end if;

  insert into public.program_enrollments (
    user_id,
    program_id,
    schedule_id,
    dog_id,
    dog_name,
    physical_card_number,
    status,
    attendances_count,
    program_level,
    last_attendance_at,
    notes,
    started_at,
    card_started_on,
    card_expires_on,
    requirements_met_at,
    access_mode,
    membership_id
  ) values (
    v_membership.user_id,
    v_program_id,
    v_schedule_id,
    v_dog.id,
    v_dog.name,
    null,
    'active',
    0,
    v_level,
    null,
    coalesce(v_reason, 'Etapa de socio asignada manualmente por Admin.'),
    (clock_timestamp() at time zone 'America/Mexico_City')::date,
    null,
    null,
    null,
    'membership',
    v_membership.id
  )
  returning id into v_new_id;

  -- Entrar a una etapa prueba administrativamente las etapas anteriores.
  -- Avanzado NO se otorga por entrar a Avanzado: la constancia continúa
  -- mediante hitos de asistencia.
  if lower(btrim(p_program_code)) = 'comandos' then
    v_codes := array['puppy_completed'];
    if v_level in ('medio', 'avanzado') then
      v_codes := array_append(v_codes, 'comandos_basico_completed');
    end if;
    if v_level = 'avanzado' then
      v_codes := array_append(v_codes, 'comandos_medio_completed');
    end if;
  end if;

  foreach v_code in array v_codes loop
    insert into public.user_achievements (
      user_id,
      dog_id,
      achievement_code,
      source_type,
      source_id,
      awarded_at,
      awarded_by
    )
    select
      v_membership.user_id,
      v_dog.id,
      v_code,
      'program_progression',
      null,
      clock_timestamp(),
      auth.uid()
    where not exists (
      select 1
      from public.user_achievements ua
      where ua.user_id = v_membership.user_id
        and ua.dog_id = v_dog.id
        and ua.achievement_code = v_code
    );
  end loop;

  insert into public.admin_audit_logs (
    admin_user_id,
    action,
    entity_type,
    entity_id,
    details
  ) values (
    auth.uid(),
    'membership_dog.training_stage',
    'program_enrollment',
    v_new_id,
    jsonb_build_object(
      'membership_id', v_membership.id,
      'user_id', v_membership.user_id,
      'dog_id', v_dog.id,
      'program_code', lower(btrim(p_program_code)),
      'program_level', v_level,
      'previous_enrollment_id', v_current.id,
      'reason', v_reason
    )
  );

  return v_new_id;
end;
$$;

revoke all on function public.admin_set_member_dog_training_stage(uuid,uuid,text,text,text)
  from public, anon;
grant execute on function public.admin_set_member_dog_training_stage(uuid,uuid,text,text,text)
  to authenticated, service_role;

-- Backfill: todos los perros activos de membresías activas quedan cubiertos por
-- defecto. Las futuras excepciones se conservan como filas explícitas false.
insert into public.membership_dog_access (
  membership_id,
  user_id,
  dog_id,
  is_covered,
  changed_by
)
select
  m.id,
  m.user_id,
  d.id,
  true,
  null
from public.memberships m
join public.dogs d
  on d.user_id = m.user_id
 and d.is_active = true
where m.status = 'active'
on conflict (membership_id, dog_id) do nothing;

do $$
declare
  r record;
begin
  for r in
    select m.id as membership_id, a.dog_id
    from public.memberships m
    join public.membership_dog_access a on a.membership_id = m.id
    where m.status = 'active'
      and a.is_covered = true
  loop
    perform public.ucapsa_ensure_member_dog_training_access(r.membership_id, r.dog_id);
  end loop;
end $$;

commit;
