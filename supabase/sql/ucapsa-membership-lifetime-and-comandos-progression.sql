-- UCAPSA — Membresía sin vencimiento y progresión de Comandos
-- La membresía activa dura toda la vida del perro: no vence por fecha.
-- Comandos se desbloquea de forma secuencial por decisión administrativa:
-- Básico -> Intermedio -> Avanzado.

update public.memberships
set end_date = null,
    updated_at = now()
where status = 'active'
  and end_date is not null;

create or replace function public.enforce_lifetime_membership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'active' then
    new.end_date := null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_lifetime_membership on public.memberships;
create trigger trg_enforce_lifetime_membership
before insert or update of status, end_date on public.memberships
for each row
execute function public.enforce_lifetime_membership();

create or replace function public.has_active_membership()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.memberships
    where user_id = auth.uid()
      and status = 'active'
      and (start_date is null or start_date <= current_date)
  );
$$;

alter table public.program_enrollments
  add column if not exists unlocked_from_enrollment_id uuid
  references public.program_enrollments(id) on delete set null;

create unique index if not exists program_enrollments_unlocked_from_unique_idx
  on public.program_enrollments(unlocked_from_enrollment_id)
  where unlocked_from_enrollment_id is not null;

create or replace function public.ucapsa_unlock_next_comandos_level(p_enrollment_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_enrollment public.program_enrollments%rowtype;
  v_program_code text;
  v_next_level text;
  v_existing_id uuid;
  v_new_id uuid;
begin
  select *
    into v_enrollment
  from public.program_enrollments
  where id = p_enrollment_id;

  if not found or v_enrollment.status <> 'completed' then
    return null;
  end if;

  select code
    into v_program_code
  from public.programs
  where id = v_enrollment.program_id;

  if v_program_code <> 'comandos' then
    return null;
  end if;

  v_next_level := case
    when v_enrollment.program_level in ('base', 'principiante') then 'medio'
    when v_enrollment.program_level = 'medio' then 'avanzado'
    else null
  end;

  if v_next_level is null then
    return null;
  end if;

  select e.id
    into v_existing_id
  from public.program_enrollments e
  where e.user_id = v_enrollment.user_id
    and e.program_id = v_enrollment.program_id
    and e.program_level = v_next_level
    and e.status in ('active', 'completed')
    and (
      (v_enrollment.dog_id is not null and e.dog_id = v_enrollment.dog_id)
      or (
        v_enrollment.dog_id is null
        and e.dog_id is null
        and lower(btrim(coalesce(e.dog_name, ''))) = lower(btrim(coalesce(v_enrollment.dog_name, '')))
      )
    )
  order by e.created_at asc
  limit 1;

  if v_existing_id is not null then
    return v_existing_id;
  end if;

  insert into public.program_enrollments (
    user_id,
    program_id,
    schedule_id,
    dog_id,
    dog_name,
    physical_card_number,
    qr_token,
    status,
    attendances_count,
    program_level,
    last_attendance_at,
    notes,
    started_at,
    unlocked_from_enrollment_id
  ) values (
    v_enrollment.user_id,
    v_enrollment.program_id,
    v_enrollment.schedule_id,
    v_enrollment.dog_id,
    v_enrollment.dog_name,
    null,
    concat('program_', replace(gen_random_uuid()::text, '-', '')),
    'active',
    0,
    v_next_level,
    null,
    case
      when v_next_level = 'medio' then 'Intermedio desbloqueado automaticamente al completar Basico.'
      else 'Avanzado desbloqueado automaticamente al completar Intermedio.'
    end,
    (clock_timestamp() at time zone 'America/Mexico_City')::date,
    v_enrollment.id
  )
  returning id into v_new_id;

  return v_new_id;
end;
$$;

create or replace function public.trg_ucapsa_unlock_next_comandos_level()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'completed' and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    perform public.ucapsa_unlock_next_comandos_level(new.id);
  elsif tg_op = 'UPDATE'
    and old.status = 'completed'
    and new.status is distinct from 'completed' then
    delete from public.program_enrollments child
    where child.unlocked_from_enrollment_id = new.id
      and child.status = 'active'
      and not exists (
        select 1
        from public.program_attendances a
        where a.enrollment_id = child.id
      );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_ucapsa_unlock_next_comandos_level on public.program_enrollments;
create trigger trg_ucapsa_unlock_next_comandos_level
after insert or update of status on public.program_enrollments
for each row
execute function public.trg_ucapsa_unlock_next_comandos_level();

do $$
declare
  r record;
begin
  for r in
    select e.id
    from public.program_enrollments e
    join public.programs p on p.id = e.program_id
    where p.code = 'comandos'
      and e.status = 'completed'
  loop
    perform public.ucapsa_unlock_next_comandos_level(r.id);
  end loop;
end;
$$;
