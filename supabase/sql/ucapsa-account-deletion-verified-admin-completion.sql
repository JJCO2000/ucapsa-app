-- UCAPSA deletion completion guard, prepared from installed production RPC.
-- REVIEW / TEST IN ISOLATION BEFORE APPLYING: Auth deletion and retention are irreversible.
-- Installs no trigger, does not touch existing rows until the RPC is invoked.
-- Subject FK: public.account_deletion_requests.user_id REFERENCES auth.users(id) ON DELETE SET NULL.
-- Consequently a non-NULL subject means its Auth user still exists, and a
-- Superadmin must NEVER mark the request completed based only on a note.
-- Manual completion remains restricted to blocked requests after retention_until.
--
-- APPLY ONLY as a reviewed versioned DB migration after an isolated database test.
-- Rollback: restore original function definition from
-- supabase/sql/ucapsa-account-deletion-audit-trail.sql; no historical rows are changed.
create or replace function public.admin_complete_account_deletion_request(
  p_request_id uuid,
  p_resolution_note text,
  p_notification_method text,
  p_notification_reference text
)
returns public.account_deletion_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before public.account_deletion_requests%rowtype;
  v_after public.account_deletion_requests%rowtype;
  v_now timestamptz := now();
  v_note text := nullif(btrim(coalesce(p_resolution_note, '')), '');
  v_method text := nullif(btrim(coalesce(p_notification_method, '')), '');
  v_reference text := nullif(btrim(coalesce(p_notification_reference, '')), '');
begin
  if not public.is_super_admin() then
    raise exception 'Solo super_admin puede cerrar solicitudes de eliminacion de cuenta.';
  end if;

  select *
    into v_before
  from public.account_deletion_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'Solicitud no encontrada.';
  end if;

  if v_before.status <> 'blocked' then
    raise exception 'La solicitud debe estar bloqueada antes de cerrarse.';
  end if;

  if v_before.retention_until is null then
    raise exception 'La solicitud no tiene fecha de fin de bloqueo.';
  end if;

  if v_before.retention_until > current_date then
    raise exception 'No se puede cerrar antes de concluir el periodo de bloqueo.';
  end if;

  -- user_id is a foreign key to Auth ON DELETE SET NULL.  Until Auth is
  -- actually removed, this field remains non-null.  A note alone is never
  -- acceptable evidence of account deletion.  Keep this check in PostgreSQL
  -- so Admin clients and direct RPC callers have exactly one business rule.
  if v_before.user_id is not null then
    raise exception 'La cuenta sigue activa en Auth; elimina la identidad y verifica la supresion antes de cerrar.'
      using errcode = '23514';
  end if;

  if v_note is null or length(v_note) < 5 then
    raise exception 'La resolucion requiere evidencia de supresion.';
  end if;

  if v_method is null then
    raise exception 'Debes registrar el medio de notificacion al titular.';
  end if;

  if v_reference is null then
    raise exception 'Debes registrar una referencia de la notificacion al titular.';
  end if;

  update public.account_deletion_requests
  set
    status = 'completed',
    -- No unnecessary contact snapshot once the request is finalized.
    snapshot_name = null,
    snapshot_email = null,
    resolution_note = v_note,
    notification_method = v_method,
    notification_reference = v_reference,
    notified_at = v_now,
    resolved_by = auth.uid(),
    resolved_at = v_now,
    updated_at = v_now
  where id = p_request_id
  returning * into v_after;

  insert into public.account_deletion_request_events (
    request_id,
    actor_user_id,
    event_type,
    from_status,
    to_status,
    note,
    retention_until,
    notification_method,
    notification_reference
  ) values (
    v_after.id,
    auth.uid(),
    'completed',
    v_before.status,
    v_after.status,
    v_after.resolution_note,
    v_after.retention_until,
    v_after.notification_method,
    v_after.notification_reference
  );

  return v_after;
end;
$$;

revoke all on function public.admin_complete_account_deletion_request(uuid, text, text, text)
  from public, anon;
grant execute on function public.admin_complete_account_deletion_request(uuid, text, text, text)
  to authenticated, service_role;
