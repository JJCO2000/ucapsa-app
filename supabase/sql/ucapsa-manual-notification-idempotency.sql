-- UCAPSA manual notification idempotency.
--
-- Manual sends are split into two phases:
-- 1) prepare one durable campaign row in PostgreSQL;
-- 2) claim draft -> sending atomically before any call to Expo.
--
-- A retry reuses the same campaign id and therefore cannot create a second send.
-- Legacy one-call clients are protected by a short exact-payload reuse window,
-- serialized with an advisory transaction lock.

alter table public.notification_deliveries
  drop constraint if exists notification_deliveries_status_check;

alter table public.notification_deliveries
  add constraint notification_deliveries_status_check
  check (status in ('queued', 'sending', 'sent', 'error'));

create unique index if not exists notification_deliveries_campaign_token_unique
  on public.notification_deliveries (campaign_id, token_id)
  where token_id is not null;

create or replace function public.admin_prepare_notification_campaign(
  p_title text,
  p_body text,
  p_audience text,
  p_category text,
  p_reuse_recent boolean default false
)
returns public.notification_campaigns
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_title text := btrim(coalesce(p_title, ''));
  v_body text := btrim(coalesce(p_body, ''));
  v_audience text := coalesce(nullif(btrim(p_audience), ''), 'public');
  v_category text := coalesce(nullif(btrim(p_category), ''), 'announcements_events');
  v_row public.notification_campaigns%rowtype;
  v_lock_key bigint;
begin
  if v_user_id is null then
    raise exception 'No hay sesion activa.';
  end if;

  if not public.is_ucapsa_admin() then
    raise exception 'Solo administradores pueden preparar notificaciones.';
  end if;

  if v_title = '' then
    raise exception 'El titulo es obligatorio.';
  end if;

  if char_length(v_title) > 80 then
    raise exception 'El titulo no puede exceder 80 caracteres.';
  end if;

  if v_body = '' then
    raise exception 'El mensaje es obligatorio.';
  end if;

  if char_length(v_body) > 180 then
    raise exception 'El mensaje no puede exceder 180 caracteres.';
  end if;

  if v_audience not in ('public', 'clients', 'members', 'admins') then
    raise exception 'Audiencia invalida.';
  end if;

  if v_category not in ('announcements_events', 'classes', 'membership', 'achievements') then
    raise exception 'Categoria invalida.';
  end if;

  if p_reuse_recent then
    v_lock_key := hashtextextended(
      concat_ws(
        E'\n',
        v_user_id::text,
        v_title,
        v_body,
        v_audience,
        v_category
      ),
      0
    );

    perform pg_advisory_xact_lock(v_lock_key);

    select *
      into v_row
    from public.notification_campaigns c
    where c.created_by = v_user_id
      and c.title = v_title
      and c.body = v_body
      and c.audience = v_audience
      and c.category = v_category
      and c.archived_at is null
      and c.metadata ->> 'source' = 'admin_manual'
      and c.created_at >= now() - interval '5 minutes'
    order by c.created_at desc
    limit 1;

    if found then
      return v_row;
    end if;
  end if;

  insert into public.notification_campaigns (
    title,
    body,
    audience,
    category,
    status,
    total_targets,
    success_count,
    failure_count,
    created_by,
    metadata
  ) values (
    v_title,
    v_body,
    v_audience,
    v_category,
    'draft',
    0,
    0,
    0,
    v_user_id,
    jsonb_build_object(
      'source', 'admin_manual',
      'prepared', true
    )
  )
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.admin_prepare_notification_campaign(
  text, text, text, text, boolean
) from public, anon;

grant execute on function public.admin_prepare_notification_campaign(
  text, text, text, text, boolean
) to authenticated, service_role;
