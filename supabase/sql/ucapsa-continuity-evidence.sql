-- UCAPSA — Evidencia de continuidad y valor visible
--
-- Objetivo:
-- medir, sin inventar causalidad, si la exposición a información de valor
-- (Nivel de Constancia) se asocia temporalmente con actividad y pago posteriores.
--
-- Unidad estratégica: cliente/pagador + temporada.
-- Los perros aportan hechos de uso; membresía/pagos pertenecen a la cuenta.
--
-- No crea:
-- - score de riesgo;
-- - umbral de churn;
-- - renovación ficticia (la membresía UCAPSA es de por vida del perro);
-- - castigo por días de inactividad.

create table if not exists public.ucapsa_value_exposures (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  dog_id uuid not null references public.dogs(id) on delete cascade,
  season_id uuid not null references public.ucapsa_competition_seasons(id) on delete cascade,
  surface text not null check (surface in ('constancy_summary', 'constancy_detail')),
  event_date date not null default ((timezone('America/Mexico_City', now()))::date),
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create unique index if not exists ucapsa_value_exposures_daily_unique
  on public.ucapsa_value_exposures(user_id, dog_id, season_id, surface, event_date);

create index if not exists ucapsa_value_exposures_user_season_idx
  on public.ucapsa_value_exposures(user_id, season_id, occurred_at desc);

alter table public.ucapsa_value_exposures enable row level security;

revoke all on table public.ucapsa_value_exposures from public, anon, authenticated;
grant select, insert, update, delete on table public.ucapsa_value_exposures to service_role;


create or replace function public.record_ucapsa_value_exposure(
  p_dog_id uuid,
  p_season_id uuid,
  p_surface text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if p_surface not in ('constancy_summary', 'constancy_detail') then
    raise exception 'Unsupported value exposure surface';
  end if;

  if not exists (
    select 1
    from public.dogs d
    where d.id = p_dog_id
      and d.user_id = v_user_id
  ) then
    raise exception 'Dog does not belong to current user';
  end if;

  if not exists (
    select 1
    from public.ucapsa_competition_ranges r
    where r.dog_id = p_dog_id
      and r.season_id = p_season_id
      and r.owner_user_id = v_user_id
  ) then
    raise exception 'Dog is not part of requested competition season';
  end if;

  insert into public.ucapsa_value_exposures (
    user_id,
    dog_id,
    season_id,
    surface
  )
  values (
    v_user_id,
    p_dog_id,
    p_season_id,
    p_surface
  )
  on conflict (user_id, dog_id, season_id, surface, event_date)
  do nothing;
end;
$$;

revoke all on function public.record_ucapsa_value_exposure(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.record_ucapsa_value_exposure(uuid, uuid, text)
  to authenticated;
grant execute on function public.record_ucapsa_value_exposure(uuid, uuid, text)
  to service_role;


create or replace view public.ucapsa_continuity_observations
with (security_invoker = true)
as
with customer_seasons as (
  select
    r.owner_user_id as user_id,
    r.season_id,
    max(r.season_name) as season_name,
    max(r.season_status) as season_status,
    min(r.season_starts_at) as season_starts_at,
    max(r.season_ends_at) as season_ends_at,
    count(distinct r.dog_id)::integer as dog_count,
    sum(coalesce(r.constancy_events_count, 0))::integer as constancy_events_count,
    sum(coalesce(r.command_attendances_count, 0))::integer as command_attendances_count,
    sum(coalesce(r.member_visits_count, 0))::integer as member_visits_count,
    max(r.last_event_date) as last_activity_date
  from public.ucapsa_competition_ranges r
  where r.owner_user_id is not null
    and r.season_id is not null
  group by r.owner_user_id, r.season_id
),
exposure as (
  select
    e.user_id,
    e.season_id,
    count(distinct e.event_date)::integer as exposure_days,
    min(e.occurred_at) as first_exposure_at,
    max(e.occurred_at) as last_exposure_at,
    bool_or(e.surface = 'constancy_summary') as saw_constancy_summary,
    bool_or(e.surface = 'constancy_detail') as saw_constancy_detail
  from public.ucapsa_value_exposures e
  group by e.user_id, e.season_id
)
select
  c.user_id,
  p.full_name,
  p.email,
  c.season_id,
  c.season_name,
  c.season_status,
  c.season_starts_at,
  c.season_ends_at,

  c.dog_count,
  c.constancy_events_count,
  c.command_attendances_count,
  c.member_visits_count,
  c.last_activity_date,
  case
    when c.last_activity_date is null then null
    else ((timezone('America/Mexico_City', now()))::date - c.last_activity_date)
  end as days_since_last_activity,

  coalesce(x.exposure_days, 0) as value_exposure_days,
  (x.first_exposure_at is not null) as has_value_exposure,
  x.first_exposure_at,
  x.last_exposure_at,
  coalesce(x.saw_constancy_summary, false) as saw_constancy_summary,
  coalesce(x.saw_constancy_detail, false) as saw_constancy_detail,

  m.id as membership_id,
  m.status::text as membership_status,
  (m.status = 'active') as membership_is_active,
  m.current_payment_status,
  m.last_payment_at,

  coalesce(post_activity.activity_events_after_exposure, 0)::integer as activity_events_after_exposure,
  post_activity.next_activity_date,
  case
    when x.first_exposure_at is null or post_activity.next_activity_date is null then null
    else post_activity.next_activity_date - ((timezone('America/Mexico_City', x.first_exposure_at))::date)
  end as days_to_next_activity,

  coalesce(post_payment.paid_payments_after_exposure, 0)::integer as paid_payments_after_exposure,
  post_payment.next_paid_at,
  case
    when x.first_exposure_at is null or post_payment.next_paid_at is null then null
    else (
      (timezone('America/Mexico_City', post_payment.next_paid_at))::date
      - (timezone('America/Mexico_City', x.first_exposure_at))::date
    )
  end as days_to_next_payment,

  (delete_request.first_delete_request_after_exposure is not null) as delete_request_after_exposure,
  delete_request.first_delete_request_after_exposure

from customer_seasons c
left join public.profiles p
  on p.user_id = c.user_id
left join exposure x
  on x.user_id = c.user_id
 and x.season_id = c.season_id
left join public.memberships m
  on m.user_id = c.user_id

left join lateral (
  select
    count(*)::integer as activity_events_after_exposure,
    min(ev.event_date) as next_activity_date
  from public.ucapsa_constancy_events ev
  join public.dogs d
    on d.id = ev.dog_id
  where x.first_exposure_at is not null
    and d.user_id = c.user_id
    and ev.season_id = c.season_id
    and ev.event_date > (timezone('America/Mexico_City', x.first_exposure_at))::date
) post_activity on true

left join lateral (
  select
    count(*)::integer as paid_payments_after_exposure,
    min(pay.paid_at) as next_paid_at
  from public.payments pay
  where x.first_exposure_at is not null
    and pay.user_id = c.user_id
    and pay.status = 'paid'
    and pay.paid_at > x.first_exposure_at
) post_payment on true

left join lateral (
  select
    min(r.requested_at) as first_delete_request_after_exposure
  from public.membership_delete_requests r
  where x.first_exposure_at is not null
    and r.user_id = c.user_id
    and r.requested_at > x.first_exposure_at
) delete_request on true;

comment on view public.ucapsa_continuity_observations is
  'Observaciones cliente+temporada para estudiar asociación entre valor visible, actividad, pago y continuidad. No implica causalidad ni genera score de riesgo.';

revoke all on table public.ucapsa_continuity_observations
  from public, anon, authenticated;
grant select on table public.ucapsa_continuity_observations to service_role;


create or replace function public.get_ucapsa_continuity_observations()
returns setof public.ucapsa_continuity_observations
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not exists (
    select 1
    from public.profiles p
    where p.user_id = auth.uid()
      and p.role::text in ('admin', 'super_admin')
  ) then
    raise exception 'Admin access required';
  end if;

  return query
  select o.*
  from public.ucapsa_continuity_observations o
  order by
    o.season_starts_at desc nulls last,
    o.has_value_exposure desc,
    o.last_activity_date asc nulls first,
    o.full_name asc nulls last;
end;
$$;

revoke all on function public.get_ucapsa_continuity_observations()
  from public, anon, authenticated;
grant execute on function public.get_ucapsa_continuity_observations()
  to authenticated;
grant execute on function public.get_ucapsa_continuity_observations()
  to service_role;
