-- Corrige la definición de la cohorte temprana de Continuidad.
-- La exposición temprana debe ocurrir desde la primera actividad real y hasta +7 días.
-- Reemplaza únicamente la vista; no borra ni reescribe eventos o exposiciones.

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
    min(r.first_event_date) as first_activity_date,
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
  delete_request.first_delete_request_after_exposure,

  c.first_activity_date,

  coalesce(post_activity.activity_within_7d_after_exposure, 0)::integer as activity_within_7d_after_exposure,
  coalesce(post_activity.activity_within_30d_after_exposure, 0)::integer as activity_within_30d_after_exposure,
  coalesce(post_activity.activity_within_60d_after_exposure, 0)::integer as activity_within_60d_after_exposure,
  coalesce(post_activity.activity_within_90d_after_exposure, 0)::integer as activity_within_90d_after_exposure,

  coalesce(post_payment.any_payment_within_7d_after_exposure, 0)::integer as any_payment_within_7d_after_exposure,
  coalesce(post_payment.any_payment_within_30d_after_exposure, 0)::integer as any_payment_within_30d_after_exposure,
  coalesce(post_payment.any_payment_within_60d_after_exposure, 0)::integer as any_payment_within_60d_after_exposure,
  coalesce(post_payment.any_payment_within_90d_after_exposure, 0)::integer as any_payment_within_90d_after_exposure,

  coalesce(post_payment.membership_paid_payments_after_exposure, 0)::integer as membership_paid_payments_after_exposure,
  post_payment.next_membership_paid_at,
  case
    when x.first_exposure_at is null or post_payment.next_membership_paid_at is null then null
    else (
      (timezone('America/Mexico_City', post_payment.next_membership_paid_at))::date
      - (timezone('America/Mexico_City', x.first_exposure_at))::date
    )
  end as days_to_next_membership_payment,
  coalesce(post_payment.membership_payment_within_7d_after_exposure, 0)::integer as membership_payment_within_7d_after_exposure,
  coalesce(post_payment.membership_payment_within_30d_after_exposure, 0)::integer as membership_payment_within_30d_after_exposure,
  coalesce(post_payment.membership_payment_within_60d_after_exposure, 0)::integer as membership_payment_within_60d_after_exposure,
  coalesce(post_payment.membership_payment_within_90d_after_exposure, 0)::integer as membership_payment_within_90d_after_exposure,

  (
    c.first_activity_date is not null
    and (timezone('America/Mexico_City', now()))::date >= c.first_activity_date + 37
  ) as cohort_followup_complete,
  (
    c.first_activity_date is not null
    and x.first_exposure_at is not null
    and (timezone('America/Mexico_City', x.first_exposure_at))::date >= c.season_starts_at::date
    and (timezone('America/Mexico_City', x.first_exposure_at))::date >= c.first_activity_date
    and (timezone('America/Mexico_City', x.first_exposure_at))::date <= c.first_activity_date + 7
  ) as early_value_exposure,
  coalesce(cohort_activity.activity_events_followup_30d, 0)::integer as cohort_activity_events_30d,
  coalesce(cohort_payment.any_payments_followup_30d, 0)::integer as cohort_any_payments_30d,
  coalesce(cohort_payment.membership_payments_followup_30d, 0)::integer as cohort_membership_payments_30d

from customer_seasons c
left join public.profiles p
  on p.user_id = c.user_id
left join exposure x
  on x.user_id = c.user_id
 and x.season_id = c.season_id

left join lateral (
  select m.*
  from public.memberships m
  where m.user_id = c.user_id
  order by m.created_at desc
  limit 1
) m on true

left join lateral (
  select
    count(*)::integer as activity_events_after_exposure,
    min(ev.event_date) as next_activity_date,
    count(*) filter (
      where ev.event_date <= (timezone('America/Mexico_City', x.first_exposure_at))::date + 7
    )::integer as activity_within_7d_after_exposure,
    count(*) filter (
      where ev.event_date <= (timezone('America/Mexico_City', x.first_exposure_at))::date + 30
    )::integer as activity_within_30d_after_exposure,
    count(*) filter (
      where ev.event_date <= (timezone('America/Mexico_City', x.first_exposure_at))::date + 60
    )::integer as activity_within_60d_after_exposure,
    count(*) filter (
      where ev.event_date <= (timezone('America/Mexico_City', x.first_exposure_at))::date + 90
    )::integer as activity_within_90d_after_exposure
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
    min(pay.paid_at) as next_paid_at,
    count(*) filter (
      where (timezone('America/Mexico_City', pay.paid_at))::date
        <= (timezone('America/Mexico_City', x.first_exposure_at))::date + 7
    )::integer as any_payment_within_7d_after_exposure,
    count(*) filter (
      where (timezone('America/Mexico_City', pay.paid_at))::date
        <= (timezone('America/Mexico_City', x.first_exposure_at))::date + 30
    )::integer as any_payment_within_30d_after_exposure,
    count(*) filter (
      where (timezone('America/Mexico_City', pay.paid_at))::date
        <= (timezone('America/Mexico_City', x.first_exposure_at))::date + 60
    )::integer as any_payment_within_60d_after_exposure,
    count(*) filter (
      where (timezone('America/Mexico_City', pay.paid_at))::date
        <= (timezone('America/Mexico_City', x.first_exposure_at))::date + 90
    )::integer as any_payment_within_90d_after_exposure,
    count(*) filter (
      where coalesce(po.obligation_type, '') = 'membership'
         or lower(trim(coalesce(pay.concept, ''))) = 'mensualidad de socio'
    )::integer as membership_paid_payments_after_exposure,
    min(pay.paid_at) filter (
      where coalesce(po.obligation_type, '') = 'membership'
         or lower(trim(coalesce(pay.concept, ''))) = 'mensualidad de socio'
    ) as next_membership_paid_at,
    count(*) filter (
      where (
        coalesce(po.obligation_type, '') = 'membership'
        or lower(trim(coalesce(pay.concept, ''))) = 'mensualidad de socio'
      )
      and (timezone('America/Mexico_City', pay.paid_at))::date
        <= (timezone('America/Mexico_City', x.first_exposure_at))::date + 7
    )::integer as membership_payment_within_7d_after_exposure,
    count(*) filter (
      where (
        coalesce(po.obligation_type, '') = 'membership'
        or lower(trim(coalesce(pay.concept, ''))) = 'mensualidad de socio'
      )
      and (timezone('America/Mexico_City', pay.paid_at))::date
        <= (timezone('America/Mexico_City', x.first_exposure_at))::date + 30
    )::integer as membership_payment_within_30d_after_exposure,
    count(*) filter (
      where (
        coalesce(po.obligation_type, '') = 'membership'
        or lower(trim(coalesce(pay.concept, ''))) = 'mensualidad de socio'
      )
      and (timezone('America/Mexico_City', pay.paid_at))::date
        <= (timezone('America/Mexico_City', x.first_exposure_at))::date + 60
    )::integer as membership_payment_within_60d_after_exposure,
    count(*) filter (
      where (
        coalesce(po.obligation_type, '') = 'membership'
        or lower(trim(coalesce(pay.concept, ''))) = 'mensualidad de socio'
      )
      and (timezone('America/Mexico_City', pay.paid_at))::date
        <= (timezone('America/Mexico_City', x.first_exposure_at))::date + 90
    )::integer as membership_payment_within_90d_after_exposure
  from public.payments pay
  left join public.payment_obligations po
    on po.id = pay.obligation_id
  where x.first_exposure_at is not null
    and pay.user_id = c.user_id
    and pay.status = 'paid'
    and pay.paid_at > x.first_exposure_at
) post_payment on true

left join lateral (
  select
    count(*)::integer as activity_events_followup_30d
  from public.ucapsa_constancy_events ev
  join public.dogs d
    on d.id = ev.dog_id
  where c.first_activity_date is not null
    and d.user_id = c.user_id
    and ev.season_id = c.season_id
    and ev.event_date > c.first_activity_date + 7
    and ev.event_date <= c.first_activity_date + 37
) cohort_activity on true

left join lateral (
  select
    count(*)::integer as any_payments_followup_30d,
    count(*) filter (
      where coalesce(po.obligation_type, '') = 'membership'
         or lower(trim(coalesce(pay.concept, ''))) = 'mensualidad de socio'
    )::integer as membership_payments_followup_30d
  from public.payments pay
  left join public.payment_obligations po
    on po.id = pay.obligation_id
  where c.first_activity_date is not null
    and pay.user_id = c.user_id
    and pay.status = 'paid'
    and (timezone('America/Mexico_City', pay.paid_at))::date > c.first_activity_date + 7
    and (timezone('America/Mexico_City', pay.paid_at))::date <= c.first_activity_date + 37
) cohort_payment on true

left join lateral (
  select
    min(r.requested_at) as first_delete_request_after_exposure
  from public.membership_delete_requests r
  where x.first_exposure_at is not null
    and r.user_id = c.user_id
    and r.requested_at > x.first_exposure_at
) delete_request on true;

comment on view public.ucapsa_continuity_observations is
  'Observaciones cliente+temporada para estudiar asociación entre exposición al Nivel de Constancia, actividad y pagos. Incluye ventanas 7/30/60/90 días y una cohorte comparable: exposición dentro de los primeros 7 días desde la primera actividad, seguida por 30 días completos de seguimiento. No implica causalidad ni genera score de riesgo.';
