-- Visita introductoria Puppy del sábado: intención y respuesta, nunca inscripción ni asistencia.
create table if not exists public.intro_class_agenda_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  dog_id uuid not null references public.dogs(id) on delete cascade,
  schedule_id uuid not null references public.program_schedules(id),
  class_date date not null,
  status text not null default 'planned' check (status in ('planned','yes','no','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint intro_agenda_unique_per_dog_class unique (user_id,dog_id,schedule_id,class_date)
);
create index if not exists intro_agenda_class_date_schedule_idx
on public.intro_class_agenda_plans(class_date,schedule_id) where status <> 'cancelled';
create index if not exists intro_agenda_user_date_idx
on public.intro_class_agenda_plans(user_id,class_date);

alter table public.intro_class_agenda_plans enable row level security;
revoke all on public.intro_class_agenda_plans from public,anon,authenticated;
grant select on public.intro_class_agenda_plans to authenticated;
create policy intro_agenda_read_owner_or_staff on public.intro_class_agenda_plans
for select to authenticated using (
  user_id = (select auth.uid()) or (select public.is_ucapsa_staff())
);

-- Mutaciones encapsuladas: no permite falsificar inscripciones ni clases distintas a la inicial.
create or replace function public.save_intro_class_agenda_plan(
  p_dog_id uuid, p_class_date date, p_status text
)
returns table (id uuid,dog_id uuid,schedule_id uuid,class_date date,status text)
language plpgsql security definer
set search_path = public, pg_temp
as $function$
declare
  v_user uuid := (select auth.uid());
  v_schedule public.program_schedules%rowtype;
  v_effective record;
  v_today date := (clock_timestamp() at time zone 'America/Mexico_City')::date;
  v_status text := lower(btrim(coalesce(p_status, '')));
begin
  if v_user is null then
    raise exception 'Inicia sesión para agendar.' using errcode='42501';
  end if;
  if v_status not in ('planned','yes','no','cancelled') then
    raise exception 'Respuesta de agenda inválida.' using errcode='22023';
  end if;
  if p_class_date is null or p_class_date < v_today or p_class_date > v_today + 120 then
    raise exception 'Selecciona una clase futura dentro de los próximos 120 días.' using errcode='22023';
  end if;
  if extract(dow from p_class_date)::integer <> 6 then
    raise exception 'La visita inicial solo se agenda los sábados.' using errcode='22023';
  end if;
  if not exists (
    select 1 from public.dogs d
    where d.id=p_dog_id and d.user_id=v_user and d.is_active=true
  ) then
    raise exception 'El perro debe pertenecer a tu cuenta y estar activo.' using errcode='42501';
  end if;
  select s.* into v_schedule
  from public.program_schedules s
  join public.programs p on p.id=s.program_id
  where p.code='puppy' and p.is_active=true and s.is_active=true
    and s.day_of_week=6 and s.start_time=time '10:00'
    and s.sequence_order=1
  order by s.id limit 1;
  if not found then
    raise exception 'La clase inicial de Puppy no está disponible.' using errcode='22023';
  end if;
  select * into v_effective
  from public.get_effective_program_schedule(v_schedule.id,p_class_date) limit 1;
  if not found or not v_effective.is_active or v_effective.day_of_week<>6
     or v_effective.start_time<>time '10:00' then
    raise exception 'No hay una clase inicial activa en esa fecha.' using errcode='22023';
  end if;
  if exists(select 1 from public.program_class_cancellations c
    where c.schedule_id=v_schedule.id and c.cancellation_date=p_class_date and c.restored_at is null) then
    raise exception 'Esa clase está cancelada.' using errcode='22023';
  end if;
  insert into public.intro_class_agenda_plans as x (user_id,dog_id,schedule_id,class_date,status)
  values (v_user,p_dog_id,v_schedule.id,p_class_date,v_status)
  on conflict on constraint intro_agenda_unique_per_dog_class
  do update set status=excluded.status,updated_at=clock_timestamp();
  return query select x.id,x.dog_id,x.schedule_id,x.class_date,x.status
    from public.intro_class_agenda_plans x where x.user_id=v_user and x.dog_id=p_dog_id
      and x.schedule_id=v_schedule.id and x.class_date=p_class_date;
end
$function$;
revoke all on function public.save_intro_class_agenda_plan(uuid,date,text) from public,anon;
grant execute on function public.save_intro_class_agenda_plan(uuid,date,text) to authenticated;
comment on table public.intro_class_agenda_plans is
  'Visita inicial Puppy: intención y respuesta; NO es inscripción, pase, cupo confirmado, puntos o asistencia.';
