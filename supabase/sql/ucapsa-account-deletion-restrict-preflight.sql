-- UCAPSA: read-only preflight for irreversible account deletion.
-- Apply as a reviewed migration BEFORE deploying the updated delete-account function.
-- The result does not authorize deletion or erase any records.
create or replace function public.account_deletion_has_blocking_references(p_user_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_fk record;
  v_exists boolean;
begin
  -- This procedure is for the verified server service role only.
  if coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    raise exception 'Account deletion preflight is restricted to the server.'
      using errcode = '42501';
  end if;
  if p_user_id is null then
    raise exception 'A verified user ID is required.' using errcode = '22023';
  end if;

  -- Inspect all single-column RESTRICT/NO ACTION FKs that point to auth.users.
  -- Auth's own child tables are managed by Supabase Auth; do not treat them as blockers.
  for v_fk in
    select con.conrelid::regclass as relation, attribute.attname as column_name
    from pg_catalog.pg_constraint con
    join pg_catalog.pg_class rel on rel.oid = con.conrelid
    join pg_catalog.pg_namespace namespace on namespace.oid = rel.relnamespace
    join pg_catalog.pg_attribute attribute
      on attribute.attrelid = con.conrelid and attribute.attnum = con.conkey[1]
    where con.contype = 'f'
      and con.confrelid = 'auth.users'::regclass
      and con.confdeltype in ('r', 'a')
      and pg_catalog.array_length(con.conkey, 1) = 1
      and namespace.nspname not in ('auth', 'storage', 'pg_catalog', 'information_schema')
  loop
    execute pg_catalog.format(
      'select exists (select 1 from %s where %I = $1)',
      v_fk.relation, v_fk.column_name
    ) into v_exists using p_user_id;
    if v_exists then return true; end if;
  end loop;
  return false;
end;
$$;

revoke all on function public.account_deletion_has_blocking_references(uuid)
from public, anon, authenticated;
grant execute on function public.account_deletion_has_blocking_references(uuid)
to service_role;
