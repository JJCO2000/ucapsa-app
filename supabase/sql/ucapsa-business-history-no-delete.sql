-- Preserve UCAPSA operational history.
--
-- Lifecycle state is canonical for these business records:
-- announcements/events -> archived_at
-- class cancellations -> restored_at
-- restaurant categories/items -> is_active / is_available
-- user achievements -> historical award record
--
-- Normal authenticated administration must not physically delete these rows.

drop policy if exists "announcements_admin_delete" on public.announcements;
drop policy if exists "events_admin_delete" on public.events;
drop policy if exists "program_class_cancellations_admin_delete" on public.program_class_cancellations;
drop policy if exists "Admins can delete restaurant categories" on public.restaurant_menu_categories;
drop policy if exists "Admins can delete restaurant items" on public.restaurant_menu_items;
drop policy if exists "user_achievements_admin_delete" on public.user_achievements;

revoke delete on table public.announcements from anon, authenticated;
revoke delete on table public.events from anon, authenticated;
revoke delete on table public.program_class_cancellations from anon, authenticated;
revoke delete on table public.restaurant_menu_categories from anon, authenticated;
revoke delete on table public.restaurant_menu_items from anon, authenticated;
revoke delete on table public.user_achievements from anon, authenticated;
