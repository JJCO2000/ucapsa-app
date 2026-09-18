-- Final cleanup of proven RLS overlaps.
--
-- This migration preserves authorization semantics while ensuring that each
-- role/action pair has a single permissive policy where the live advisor still
-- reported duplication.

do $ucapsa$
declare
  v_count integer;
begin
  select count(*)
    into v_count
  from pg_policies
  where schemaname = 'public'
    and (tablename, policyname) in (
      ('achievement_definitions','achievement_definitions_admin_all'),
      ('achievement_definitions','achievement_definitions_select_all'),
      ('announcements','announcements_admin_all'),
      ('announcements','announcements_select_by_audience'),
      ('dog_documents','dog_documents_admin_all'),
      ('dog_documents','dog_documents_owner_insert_enabled'),
      ('dog_documents','dog_documents_owner_select_enabled'),
      ('dogs','dogs_admin_all'),
      ('dogs','dogs_owner_insert_enabled'),
      ('dogs','dogs_owner_select_enabled'),
      ('dogs','dogs_owner_update_enabled'),
      ('events','events_admin_all'),
      ('events','events_select_by_audience'),
      ('memberships','memberships_admin_insert'),
      ('memberships','memberships_insert_own_pending'),
      ('program_exams','program_exams_admin_all'),
      ('program_exams','program_exams_owner_insert_enabled'),
      ('program_exams','program_exams_owner_select_enabled')
    );

  if v_count <> 18 then
    raise exception 'Expected 18 RLS policies before overlap cleanup, found %', v_count;
  end if;
end;
$ucapsa$;

-- achievement_definitions:
-- public/authenticated keep active rows; admins additionally keep inactive rows.
alter policy "achievement_definitions_select_all"
  on public.achievement_definitions
  using ((is_active = true) or public.is_admin());

drop policy "achievement_definitions_admin_all"
  on public.achievement_definitions;

create policy "achievement_definitions_admin_insert"
  on public.achievement_definitions
  for insert
  to authenticated
  with check (public.is_admin());

create policy "achievement_definitions_admin_update"
  on public.achievement_definitions
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "achievement_definitions_admin_delete"
  on public.achievement_definitions
  for delete
  to authenticated
  using (public.is_admin());

-- announcements/events:
-- their canonical SELECT policies already include is_admin(), so admin_all
-- only needs to be replaced by write-only policies.
drop policy "announcements_admin_all"
  on public.announcements;

create policy "announcements_admin_insert"
  on public.announcements
  for insert
  to authenticated
  with check (public.is_admin());

create policy "announcements_admin_update"
  on public.announcements
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "announcements_admin_delete"
  on public.announcements
  for delete
  to authenticated
  using (public.is_admin());

drop policy "events_admin_all"
  on public.events;

create policy "events_admin_insert"
  on public.events
  for insert
  to authenticated
  with check (public.is_admin());

create policy "events_admin_update"
  on public.events
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "events_admin_delete"
  on public.events
  for delete
  to authenticated
  using (public.is_admin());

-- dogs:
-- one policy per owner/admin action; delete remains admin-only.
alter policy "dogs_owner_insert_enabled"
  on public.dogs
  with check (
    public.is_admin()
    or (
      public.is_feature_enabled('dog_profiles')
      and user_id = (select auth.uid())
    )
  );

alter policy "dogs_owner_select_enabled"
  on public.dogs
  using (
    public.is_admin()
    or (
      public.is_feature_enabled('dog_profiles')
      and user_id = (select auth.uid())
    )
  );

alter policy "dogs_owner_update_enabled"
  on public.dogs
  using (
    public.is_admin()
    or (
      public.is_feature_enabled('dog_profiles')
      and user_id = (select auth.uid())
    )
  )
  with check (
    public.is_admin()
    or (
      public.is_feature_enabled('dog_profiles')
      and user_id = (select auth.uid())
    )
  );

drop policy "dogs_admin_all"
  on public.dogs;

create policy "dogs_admin_delete"
  on public.dogs
  for delete
  to authenticated
  using (public.is_admin());

-- dog_documents:
-- owner/admin share insert/select; only admin may update/delete.
alter policy "dog_documents_owner_insert_enabled"
  on public.dog_documents
  with check (
    public.is_admin()
    or (
      public.is_feature_enabled('dog_profiles')
      and public.is_feature_enabled('dog_documents')
      and status = 'pending'
      and uploaded_by = (select auth.uid())
      and reviewed_by is null
      and reviewed_at is null
      and rejection_reason is null
      and exists (
        select 1
        from public.dogs d
        where d.id = dog_documents.dog_id
          and d.user_id = (select auth.uid())
      )
    )
  );

alter policy "dog_documents_owner_select_enabled"
  on public.dog_documents
  using (
    public.is_admin()
    or (
      public.is_feature_enabled('dog_profiles')
      and public.is_feature_enabled('dog_documents')
      and exists (
        select 1
        from public.dogs d
        where d.id = dog_documents.dog_id
          and d.user_id = (select auth.uid())
      )
    )
  );

drop policy "dog_documents_admin_all"
  on public.dog_documents;

create policy "dog_documents_admin_update"
  on public.dog_documents
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "dog_documents_admin_delete"
  on public.dog_documents
  for delete
  to authenticated
  using (public.is_admin());

-- memberships:
-- collapse owner pending + admin insert into a single INSERT policy.
drop policy "memberships_admin_insert"
  on public.memberships;

drop policy "memberships_insert_own_pending"
  on public.memberships;

create policy "memberships_insert_own_or_admin"
  on public.memberships
  for insert
  to authenticated
  with check (
    public.is_admin()
    or (
      user_id = (select auth.uid())
      and status = 'pending'
    )
  );

-- program_exams:
-- owner/admin share insert/select; only admin may update/delete.
alter policy "program_exams_owner_insert_enabled"
  on public.program_exams
  with check (
    public.is_admin()
    or (
      public.is_feature_enabled('exams')
      and requested_by = (select auth.uid())
      and status = 'requested'
      and exists (
        select 1
        from public.program_enrollments e
        where e.id = program_exams.enrollment_id
          and e.user_id = (select auth.uid())
      )
    )
  );

alter policy "program_exams_owner_select_enabled"
  on public.program_exams
  using (
    public.is_admin()
    or (
      public.is_feature_enabled('exams')
      and exists (
        select 1
        from public.program_enrollments e
        where e.id = program_exams.enrollment_id
          and e.user_id = (select auth.uid())
      )
    )
  );

drop policy "program_exams_admin_all"
  on public.program_exams;

create policy "program_exams_admin_update"
  on public.program_exams
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "program_exams_admin_delete"
  on public.program_exams
  for delete
  to authenticated
  using (public.is_admin());
