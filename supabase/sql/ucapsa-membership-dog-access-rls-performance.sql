-- UCAPSA — optimización RLS puntual para membership_dog_access
--
-- Mantiene exactamente la misma autorización:
-- - el dueño ve sus filas;
-- - Admin/Superadmin puede verlas.
--
-- Los SELECT wrappers hacen que Postgres evalúe auth.uid() y el helper de rol
-- una vez por consulta en vez de reevaluarlos fila por fila.

drop policy if exists "membership_dog_access_owner_select"
  on public.membership_dog_access;

create policy "membership_dog_access_owner_select"
on public.membership_dog_access
for select
to authenticated
using (
  user_id = (select auth.uid())
  or (select public.is_ucapsa_admin())
);
