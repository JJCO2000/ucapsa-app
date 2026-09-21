-- UCAPSA — notification security, consent and history hardening
--
-- Findings:
-- 1) authenticated Admin traffic could UPDATE notification_campaigns directly,
--    including status/counters. That could turn a processed campaign back into
--    draft and bypass the two-phase idempotency contract.
-- 2) notification token/preference RLS allowed Admin clients to read or mutate
--    device identifiers and user notification consent even though dispatch uses
--    service_role and the Admin UI does not need that access.
-- 3) campaign text/count invariants lived only in the prepare RPC/client.

do $ucapsa$
begin
  if exists (
    select 1
    from public.notification_campaigns
    where btrim(title) = ''
       or btrim(body) = ''
       or (
         coalesce(metadata ->> 'source', '') = 'admin_manual'
         and (char_length(title) > 80 or char_length(body) > 180)
       )
       or total_targets < 0
       or success_count < 0
       or failure_count < 0
  ) then
    raise exception 'Notification campaign hardening aborted: invalid existing campaign data requires review.';
  end if;
end;
$ucapsa$;

alter table public.notification_campaigns
  drop constraint if exists notification_campaigns_title_check;
alter table public.notification_campaigns
  add constraint notification_campaigns_title_check
  check (
    btrim(title) <> ''
    and (
      coalesce(metadata ->> 'source', '') <> 'admin_manual'
      or char_length(title) <= 80
    )
  );

alter table public.notification_campaigns
  drop constraint if exists notification_campaigns_body_check;
alter table public.notification_campaigns
  add constraint notification_campaigns_body_check
  check (
    btrim(body) <> ''
    and (
      coalesce(metadata ->> 'source', '') <> 'admin_manual'
      or char_length(body) <= 180
    )
  );

alter table public.notification_campaigns
  drop constraint if exists notification_campaigns_counts_check;
alter table public.notification_campaigns
  add constraint notification_campaigns_counts_check
  check (
    total_targets >= 0
    and success_count >= 0
    and failure_count >= 0
  );

-- Campaign state belongs to PostgreSQL preparation + the trusted Edge Function.
-- Authenticated Admin clients retain read access but no direct INSERT/UPDATE.
drop policy if exists "notification_campaigns_admin_update"
  on public.notification_campaigns;

revoke insert, update on table public.notification_campaigns
  from authenticated;

-- Delivery rows are evidence produced by the trusted sender, never client input.
revoke insert, update on table public.notification_deliveries
  from authenticated;

create or replace function public.admin_archive_notification_campaign(
  p_campaign_id uuid
)
returns public.notification_campaigns
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.notification_campaigns%rowtype;
begin
  if auth.uid() is null or not public.is_ucapsa_admin() then
    raise exception 'Solo administradores pueden archivar campañas.';
  end if;

  select *
    into v_row
  from public.notification_campaigns
  where id = p_campaign_id
  for update;

  if not found then
    raise exception 'Campaña no encontrada.';
  end if;

  if v_row.status = 'sending' then
    raise exception 'No se puede archivar una campaña mientras se está enviando.';
  end if;

  if v_row.archived_at is null then
    update public.notification_campaigns
    set archived_at = now(),
        updated_at = now()
    where id = p_campaign_id
    returning * into v_row;
  end if;

  return v_row;
end;
$$;

revoke all on function public.admin_archive_notification_campaign(uuid)
  from public, anon;
grant execute on function public.admin_archive_notification_campaign(uuid)
  to authenticated, service_role;

-- Notification preferences are user consent. Admins may target only users whose
-- stored preference permits the category; they must not be able to alter consent.
drop policy if exists "Users can read own notification preferences"
  on public.notification_preferences;
create policy "Users can read own notification preferences"
on public.notification_preferences
for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users can update own notification preferences"
  on public.notification_preferences;
create policy "Users can update own notification preferences"
on public.notification_preferences
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

-- Push tokens are device credentials. Registration/disablement already has
-- canonical SECURITY DEFINER RPCs, so direct client mutation is unnecessary.
drop policy if exists "Users can read own notification tokens"
  on public.notification_tokens;
create policy "Users can read own notification tokens"
on public.notification_tokens
for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert own notification tokens"
  on public.notification_tokens;
drop policy if exists "Users can update own notification tokens"
  on public.notification_tokens;

revoke insert, update on table public.notification_tokens
  from authenticated;
