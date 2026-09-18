-- UCAPSA database performance hardening.
--
-- 1) Keeps the exact RLS semantics of 35 live policies but caches auth.uid()
--    per statement through (select auth.uid()), as recommended by Supabase.
-- 2) Removes only indexes proven to be exact duplicates and not constraint-backed.

do $$
declare
  r record;
  v_count integer := 0;
begin
  for r in
    with targets(tablename, policyname) as (
      values
        ('profiles','profiles_select_own_or_admin'),
        ('profiles','profiles_insert_own'),
        ('profiles','profiles_update_own_or_admin'),
        ('memberships','memberships_select_own_or_admin'),
        ('memberships','memberships_insert_own_pending'),
        ('payments','payments_select_own_or_admin'),
        ('announcements','announcements_select_by_audience'),
        ('events','events_select_by_audience'),
        ('user_achievements','user_achievements_select_own_or_admin'),
        ('program_enrollments','program_enrollments_select_own_or_admin'),
        ('program_attendances','program_attendances_select_own_or_admin'),
        ('program_class_cancellations','program_class_cancellations_admin_insert'),
        ('program_class_cancellations','program_class_cancellations_admin_update'),
        ('program_class_cancellations','program_class_cancellations_admin_delete'),
        ('account_deletion_requests','Users read own account deletion requests'),
        ('notification_preferences','Users can read own notification preferences'),
        ('notification_preferences','Users can insert own notification preferences'),
        ('notification_preferences','Users can update own notification preferences'),
        ('notification_tokens','Users can read own notification tokens'),
        ('notification_tokens','Users can insert own notification tokens'),
        ('notification_tokens','Users can update own notification tokens'),
        ('dogs','dogs_owner_select_enabled'),
        ('dogs','dogs_owner_insert_enabled'),
        ('dogs','dogs_owner_update_enabled'),
        ('dog_documents','dog_documents_owner_select_enabled'),
        ('dog_documents','dog_documents_owner_insert_enabled'),
        ('practice_sessions','practice_sessions_own_select'),
        ('practice_sessions','practice_sessions_own_insert'),
        ('program_exams','program_exams_owner_select_enabled'),
        ('program_exams','program_exams_owner_insert_enabled'),
        ('membership_billing_profiles','membership_billing_profiles_select_own_or_admin'),
        ('payment_obligations','payment_obligations_select_own_or_admin'),
        ('member_visits','member_visits_own_select'),
        ('ucapsa_points_participants','Users can read own points participant'),
        ('ucapsa_points_ledger','Users can read own points ledger')
    )
    select p.*
    from pg_policies p
    join targets t using (tablename, policyname)
    where p.schemaname = 'public'
  loop
    execute format(
      'alter policy %I on public.%I to %s%s%s',
      r.policyname,
      r.tablename,
      array_to_string(r.roles, ', '),
      case
        when r.qual is not null
          then E'\nusing (' || replace(r.qual, 'auth.uid()', '(select auth.uid())') || ')'
        else ''
      end,
      case
        when r.with_check is not null
          then E'\nwith check (' || replace(r.with_check, 'auth.uid()', '(select auth.uid())') || ')'
        else ''
      end
    );
    v_count := v_count + 1;
  end loop;

  if v_count <> 35 then
    raise exception 'Expected 35 RLS policies to optimize, found %', v_count;
  end if;
end;
$$;

-- events_calendar_visibility_idx and events_visibility_idx had the same
-- (audience, is_published, archived_at, start_date) definition. Keep the
-- shorter canonical events_visibility_idx.
drop index if exists public.events_calendar_visibility_idx;

-- memberships_qr_token_key is the UNIQUE constraint-backed index. The explicit
-- memberships_qr_token_unique_idx duplicated it and carried no constraint.
drop index if exists public.memberships_qr_token_unique_idx;
