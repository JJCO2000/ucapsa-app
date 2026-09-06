-- Remediacion 1.2: corrige la composicion PERMISSIVE de RLS en memberships.
-- Antes, memberships_admin_all (FOR ALL) permitia DELETE a admin y hacia
-- inefectiva memberships_super_admin_delete.

drop policy if exists memberships_admin_all on public.memberships;

drop policy if exists memberships_admin_select on public.memberships;
create policy memberships_admin_select
on public.memberships
for select
to authenticated
using (public.is_admin());

drop policy if exists memberships_admin_insert on public.memberships;
create policy memberships_admin_insert
on public.memberships
for insert
to authenticated
with check (public.is_admin());

drop policy if exists memberships_admin_update on public.memberships;
create policy memberships_admin_update
on public.memberships
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

-- Se conservan intencionalmente:
--   memberships_insert_own_pending  -> solicitud propia del cliente
--   memberships_select_own_or_admin -> lectura propia / administrativa
--   memberships_super_admin_delete  -> unica via RLS de DELETE
