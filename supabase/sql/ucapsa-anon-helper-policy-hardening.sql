-- UCAPSA anonymous SECURITY DEFINER surface hardening.
--
-- Four public-read policies previously mixed anon + authenticated access while
-- calling privileged helper functions. Split those policies by role first, then
-- remove anonymous/PUBLIC EXECUTE from the helpers. Authenticated semantics stay
-- equivalent; anonymous users keep only the public rows they already needed.

-- ---------------------------------------------------------------------------
-- achievement_definitions
-- ---------------------------------------------------------------------------

drop policy if exists "achievement_definitions_select_all"
  on public.achievement_definitions;
drop policy if exists "achievement_definitions_anon_select_active"
  on public.achievement_definitions;
drop policy if exists "achievement_definitions_authenticated_select"
  on public.achievement_definitions;

create policy "achievement_definitions_anon_select_active"
on public.achievement_definitions
for select
to anon
using (is_active = true);

create policy "achievement_definitions_authenticated_select"
on public.achievement_definitions
for select
to authenticated
using ((is_active = true) or public.is_admin());

-- ---------------------------------------------------------------------------
-- announcements
-- ---------------------------------------------------------------------------

drop policy if exists "announcements_select_by_audience"
  on public.announcements;
drop policy if exists "announcements_anon_select_public"
  on public.announcements;
drop policy if exists "announcements_authenticated_select_by_audience"
  on public.announcements;

create policy "announcements_anon_select_public"
on public.announcements
for select
to anon
using (
  is_published = true
  and archived_at is null
  and audience = 'public'
);

create policy "announcements_authenticated_select_by_audience"
on public.announcements
for select
to authenticated
using (
  is_published = true
  and archived_at is null
  and (
    audience = 'public'
    or (((select auth.uid()) is not null) and audience = 'clients')
    or (audience = 'members' and public.has_active_membership())
    or (audience = 'admins' and public.is_admin())
    or public.is_admin()
  )
);

-- ---------------------------------------------------------------------------
-- events
-- ---------------------------------------------------------------------------

drop policy if exists "events_select_by_audience"
  on public.events;
drop policy if exists "events_anon_select_public"
  on public.events;
drop policy if exists "events_authenticated_select_by_audience"
  on public.events;

create policy "events_anon_select_public"
on public.events
for select
to anon
using (
  is_published = true
  and archived_at is null
  and audience = 'public'
);

create policy "events_authenticated_select_by_audience"
on public.events
for select
to authenticated
using (
  is_published = true
  and archived_at is null
  and (
    audience = 'public'
    or (((select auth.uid()) is not null) and audience = 'clients')
    or (audience = 'members' and public.has_active_membership())
    or (audience = 'admins' and public.is_admin())
    or public.is_admin()
  )
);

-- ---------------------------------------------------------------------------
-- privacy_notices
-- ---------------------------------------------------------------------------

drop policy if exists "Read published privacy notice or superadmin"
  on public.privacy_notices;
drop policy if exists "privacy_notices_anon_read_published"
  on public.privacy_notices;
drop policy if exists "privacy_notices_authenticated_read_published_or_superadmin"
  on public.privacy_notices;

create policy "privacy_notices_anon_read_published"
on public.privacy_notices
for select
to anon
using (status = 'published');

create policy "privacy_notices_authenticated_read_published_or_superadmin"
on public.privacy_notices
for select
to authenticated
using (
  status = 'published'
  or (((select auth.uid()) is not null) and public.is_super_admin())
);

-- ---------------------------------------------------------------------------
-- SECURITY DEFINER helpers
-- ---------------------------------------------------------------------------
-- These functions remain executable by authenticated users because RLS policies
-- depend on them. service_role is explicit. Anonymous access is no longer needed
-- once the public policies above stop calling the helpers.

revoke all on function public.get_my_role()
  from public, anon;
grant execute on function public.get_my_role()
  to authenticated, service_role;

revoke all on function public.has_active_membership()
  from public, anon;
grant execute on function public.has_active_membership()
  to authenticated, service_role;

revoke all on function public.is_admin()
  from public, anon;
grant execute on function public.is_admin()
  to authenticated, service_role;

revoke all on function public.is_feature_enabled(text)
  from public, anon;
grant execute on function public.is_feature_enabled(text)
  to authenticated, service_role;

revoke all on function public.is_super_admin()
  from public, anon;
grant execute on function public.is_super_admin()
  to authenticated, service_role;

revoke all on function public.is_ucapsa_admin()
  from public, anon;
grant execute on function public.is_ucapsa_admin()
  to authenticated, service_role;
