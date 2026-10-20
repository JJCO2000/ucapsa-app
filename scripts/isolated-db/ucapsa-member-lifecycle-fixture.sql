-- ONLY for ephemeral ucapsa_test PostgreSQL. Live Supabase functions
-- recovered read-only to model real membership lifecycle and dog coverage.
\set ON_ERROR_STOP on
do $$ begin
  if current_database()<>'ucapsa_test' then raise exception 'Only isolated DB'; end if;
end $$;

alter table public.profiles add column updated_at timestamptz not null default now();
alter table public.memberships
  add column member_number text unique,
  add column start_date date,
  add column end_date date,
  add column approved_by uuid references auth.users(id),
  add column qr_token text not null default gen_random_uuid()::text,
  add column current_payment_status text not null default 'pending',
  add column last_payment_at timestamptz,
  add column payment_notes text;
create unique index member_user_one on public.memberships(user_id);
create table public.membership_dog_access (
  id uuid primary key default gen_random_uuid(),
  membership_id uuid not null references public.memberships(id),
  user_id uuid not null references auth.users(id),
  dog_id uuid not null references public.dogs(id),
  is_covered boolean not null default true,
  changed_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(membership_id,dog_id)
);

-- LIVE: enforce_membership_state_invariants
CREATE OR REPLACE FUNCTION public.enforce_membership_state_invariants()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if new.status = 'active' then
    new.end_date := null;

    -- A reactivated membership must not remain in the cancelled-only payment
    -- state. Preserve an existing paid/pending state; normalize only not_required.
    if new.current_payment_status = 'not_required' then
      new.current_payment_status := 'pending';
    end if;
  elsif new.status = 'cancelled' then
    new.current_payment_status := 'not_required';
  end if;

  return new;
end;
$function$;

-- LIVE: sync_membership_status_lifecycle
CREATE OR REPLACE FUNCTION public.sync_membership_status_lifecycle()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user_id uuid;
  v_now timestamptz := now();
  v_actor uuid := auth.uid();
  v_has_active boolean;
  v_next_role public.app_role;
begin
  if tg_op = 'DELETE' then
    v_user_id := old.user_id;
  else
    v_user_id := new.user_id;
  end if;

  -- Ignore ordinary edits that do not change membership state.
  if tg_op = 'UPDATE' and old.status is not distinct from new.status then
    return new;
  end if;

  -- A cancellation stops only future obligations that still have an unpaid
  -- balance. This preserves paid evidence plus debt due today or already due.
  -- "Future" matches the canonical client payments rule: due_date > current_date.
  if tg_op <> 'DELETE'
     and new.status = 'cancelled'
     and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    update public.payment_obligations o
    set
      cancelled_at = v_now,
      cancelled_by = coalesce(o.cancelled_by, v_actor),
      updated_at = v_now
    where o.membership_id = new.id
      and o.cancelled_at is null
      and o.due_date > current_date
      and (
        o.amount - coalesce((
          select sum(p.amount)
          from public.payments p
          where p.obligation_id = o.id
            and p.status = 'paid'
            and p.voided_at is null
        ), 0)
      ) > 0.005;
  end if;

  select exists (
    select 1
    from public.memberships m
    where m.user_id = v_user_id
      and m.status = 'active'
  )
  into v_has_active;

  v_next_role := case
    when v_has_active then 'member'::public.app_role
    else 'client'::public.app_role
  end;

  update public.profiles p
  set
    role = v_next_role,
    updated_at = v_now
  where p.user_id = v_user_id
    and p.role not in ('trainer', 'admin', 'super_admin')
    and p.role is distinct from v_next_role;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$function$;

-- LIVE: trg_ucapsa_sync_membership_dog_access
CREATE OR REPLACE FUNCTION public.trg_ucapsa_sync_membership_dog_access()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if tg_op = 'INSERT'
     or old.status is distinct from new.status then
    perform public.ucapsa_sync_membership_dog_access(new.id);
  end if;
  return new;
end;
$function$;

-- LIVE: ucapsa_ensure_member_dog_training_access
CREATE OR REPLACE FUNCTION public.ucapsa_ensure_member_dog_training_access(p_membership_id uuid, p_dog_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    -- No hay evidencia suficiente para inferir programa o nivel.
    -- Se conserva la cobertura de membresía, pero Admin debe asignar
    -- explícitamente la etapa real antes de crear una inscripción ilimitada.
    return null;
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
    raise exception 'El historial de Comandos tiene un nivel no válido; requiere revisión Admin.'
      using errcode = '22023';
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
$function$;

-- LIVE: ucapsa_pick_active_program_schedule
CREATE OR REPLACE FUNCTION public.ucapsa_pick_active_program_schedule(p_program_id uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;

-- LIVE: ucapsa_sync_membership_dog_access
CREATE OR REPLACE FUNCTION public.ucapsa_sync_membership_dog_access(p_membership_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;

create trigger member_enforce_state
before insert or update of status,end_date,current_payment_status
on public.memberships for each row
execute function public.enforce_membership_state_invariants();
create trigger member_role_lifecycle
after insert or update or delete on public.memberships
for each row execute function public.sync_membership_status_lifecycle();
create trigger member_dog_sync
after insert or update of status on public.memberships
for each row execute function public.trg_ucapsa_sync_membership_dog_access();
