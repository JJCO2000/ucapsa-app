-- UCAPSA RLS semantic merge cleanup.
--
-- Goal: remove the remaining permissive-policy overlaps without changing the
-- authorization matrix. Each merged policy is the logical OR of the policies
-- it replaces. The migration aborts before touching anything if the expected
-- live policy set has drifted.

do $ucapsa$
declare
  v_missing integer;
begin
  with required(tablename, policyname) as (
    values
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
      ('memberships','memberships_select_own_or_admin'),
      ('memberships','memberships_admin_update'),
      ('memberships','memberships_super_admin_delete'),
      ('program_exams','program_exams_admin_all'),
      ('program_exams','program_exams_owner_insert_enabled'),
      ('program_exams','program_exams_owner_select_enabled')
  )
  select count(*)
    into v_missing
  from required r
  where not exists (
    select 1
    from pg_policies p
    where p.schemaname='public'
      and p.tablename=r.tablename
      and p.policyname=r.policyname
  );

  if v_missing <> 0 then
    raise exception 'RLS semantic merge aborted: % expected policies are missing.', v_missing;
  end if;
end;
$ucapsa$;

-- achievement_definitions
drop policy "achievement_definitions_admin_all" on public.achievement_definitions;
drop policy "achievement_definitions_select_all" on public.achievement_definitions;

create policy "achievement_definitions_select_anon"
  on public.achievement_definitions
  for select to anon
  using (is_active = true);

create policy "achievement_definitions_select_authenticated"
  on public.achievement_definitions
  for select to authenticated
  using ((is_active = true) or public.is_admin());

create policy "achievement_definitions_admin_insert"
  on public.achievement_definitions
  for insert to authenticated
  with check (public.is_admin());

create policy "achievement_definitions_admin_update"
  on public.achievement_definitions
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "achievement_definitions_admin_delete"
  on public.achievement_definitions
  for delete to authenticated
  using (public.is_admin());

-- announcements
drop policy "announcements_admin_all" on public.announcements;
drop policy "announcements_select_by_audience" on public.announcements;

create policy "announcements_select_canonical"
  on public.announcements
  for select to anon, authenticated
  using (
    public.is_admin()
    or (
      is_published = true
      and archived_at is null
      and (
        audience = 'public'::audience_type
        or (((select auth.uid()) is not null) and audience = 'clients'::audience_type)
        or (audience = 'members'::audience_type and public.has_active_membership())
        or (audience = 'admins'::audience_type and public.is_admin())
      )
    )
  );

create policy "announcements_admin_insert"
  on public.announcements
  for insert to authenticated
  with check (public.is_admin());

create policy "announcements_admin_update"
  on public.announcements
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "announcements_admin_delete"
  on public.announcements
  for delete to authenticated
  using (public.is_admin());

-- dog_documents
drop policy "dog_documents_admin_all" on public.dog_documents;
drop policy "dog_documents_owner_insert_enabled" on public.dog_documents;
drop policy "dog_documents_owner_select_enabled" on public.dog_documents;

create policy "dog_documents_select_canonical"
  on public.dog_documents
  for select to authenticated
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

create policy "dog_documents_insert_canonical"
  on public.dog_documents
  for insert to authenticated
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

create policy "dog_documents_admin_update"
  on public.dog_documents
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "dog_documents_admin_delete"
  on public.dog_documents
  for delete to authenticated
  using (public.is_admin());

-- dogs
drop policy "dogs_admin_all" on public.dogs;
drop policy "dogs_owner_insert_enabled" on public.dogs;
drop policy "dogs_owner_select_enabled" on public.dogs;
drop policy "dogs_owner_update_enabled" on public.dogs;

create policy "dogs_select_canonical"
  on public.dogs
  for select to authenticated
  using (
    public.is_admin()
    or (
      public.is_feature_enabled('dog_profiles')
      and user_id = (select auth.uid())
    )
  );

create policy "dogs_insert_canonical"
  on public.dogs
  for insert to authenticated
  with check (
    public.is_admin()
    or (
      public.is_feature_enabled('dog_profiles')
      and user_id = (select auth.uid())
    )
  );

create policy "dogs_update_canonical"
  on public.dogs
  for update to authenticated
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

create policy "dogs_admin_delete"
  on public.dogs
  for delete to authenticated
  using (public.is_admin());

-- events
drop policy "events_admin_all" on public.events;
drop policy "events_select_by_audience" on public.events;

create policy "events_select_canonical"
  on public.events
  for select to anon, authenticated
  using (
    public.is_admin()
    or (
      is_published = true
      and archived_at is null
      and (
        audience = 'public'::audience_type
        or (((select auth.uid()) is not null) and audience = 'clients'::audience_type)
        or (audience = 'members'::audience_type and public.has_active_membership())
        or (audience = 'admins'::audience_type and public.is_admin())
      )
    )
  );

create policy "events_admin_insert"
  on public.events
  for insert to authenticated
  with check (public.is_admin());

create policy "events_admin_update"
  on public.events
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "events_admin_delete"
  on public.events
  for delete to authenticated
  using (public.is_admin());

-- memberships: merge the two INSERT policies only.
drop policy "memberships_admin_insert" on public.memberships;
drop policy "memberships_insert_own_pending" on public.memberships;

create policy "memberships_insert_canonical"
  on public.memberships
  for insert to authenticated
  with check (
    public.is_admin()
    or (
      user_id = (select auth.uid())
      and status = 'pending'::membership_status
    )
  );

-- program_exams
drop policy "program_exams_admin_all" on public.program_exams;
drop policy "program_exams_owner_insert_enabled" on public.program_exams;
drop policy "program_exams_owner_select_enabled" on public.program_exams;

create policy "program_exams_select_canonical"
  on public.program_exams
  for select to authenticated
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

create policy "program_exams_insert_canonical"
  on public.program_exams
  for insert to authenticated
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

create policy "program_exams_admin_update"
  on public.program_exams
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "program_exams_admin_delete"
  on public.program_exams
  for delete to authenticated
  using (public.is_admin());
