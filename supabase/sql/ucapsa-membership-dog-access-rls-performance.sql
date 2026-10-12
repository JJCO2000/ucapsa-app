-- UCAPSA — membership_dog_access RLS initplan optimization
--
-- Same authorization semantics, but auth/staff predicates are evaluated once
-- per statement instead of once per row.

alter policy "membership_dog_access_owner_select"
on public.membership_dog_access
using (
  user_id = (select auth.uid())
  or (select public.is_ucapsa_admin())
);
