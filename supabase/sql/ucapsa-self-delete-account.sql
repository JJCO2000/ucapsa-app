-- Immediate self-service account deletion support for UCAPSA testing.
-- Keeps the privileged cleanup surface server-only. The Edge Function verifies
-- the caller and uses service_role; clients never receive service credentials.

create or replace function public.service_purge_self_delete_data(
  p_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_account_requests integer := 0;
  v_membership_requests integer := 0;
  v_program_enrollments integer := 0;
begin
  if p_user_id is null then
    raise exception 'user_id requerido.';
  end if;

  select role::text
    into v_role
  from public.profiles
  where user_id = p_user_id
  limit 1;

  if v_role in ('admin', 'super_admin') then
    raise exception 'Las cuentas administrativas no pueden eliminarse por autoservicio.';
  end if;

  delete from public.account_deletion_requests
  where user_id = p_user_id;
  get diagnostics v_account_requests = row_count;

  delete from public.membership_delete_requests
  where user_id = p_user_id;
  get diagnostics v_membership_requests = row_count;

  delete from public.program_enrollments
  where user_id = p_user_id;
  get diagnostics v_program_enrollments = row_count;

  return jsonb_build_object(
    'account_deletion_requests', v_account_requests,
    'membership_delete_requests', v_membership_requests,
    'program_enrollments', v_program_enrollments
  );
end;
$$;

revoke all on function public.service_purge_self_delete_data(uuid)
  from public, anon, authenticated;
grant execute on function public.service_purge_self_delete_data(uuid)
  to service_role;
