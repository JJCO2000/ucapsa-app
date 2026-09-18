-- Close SECURITY DEFINER RPCs that never need anonymous execution.
-- Public/anon privileges are removed explicitly because PostgreSQL grants
-- EXECUTE to PUBLIC by default. Authenticated/service_role keep the intended API.

revoke all on function public.get_effective_program_schedule(uuid, date) from public, anon;
grant execute on function public.get_effective_program_schedule(uuid, date) to authenticated, service_role;

revoke all on function public.program_schedule_occurs_on_date(uuid, date) from public, anon;
grant execute on function public.program_schedule_occurs_on_date(uuid, date) to authenticated, service_role;

revoke all on function public.register_program_attendance_from_qr(text, uuid, boolean, uuid, timestamptz) from public, anon;
grant execute on function public.register_program_attendance_from_qr(text, uuid, boolean, uuid, timestamptz) to authenticated, service_role;

revoke all on function public.register_program_attendance_from_qr(text, uuid, boolean) from public, anon;
grant execute on function public.register_program_attendance_from_qr(text, uuid, boolean) to authenticated, service_role;

revoke all on function public.register_program_attendance_from_qr(text, uuid) from public, anon;
grant execute on function public.register_program_attendance_from_qr(text, uuid) to authenticated, service_role;

revoke all on function public.register_member_visit_from_qr(text, uuid, timestamptz) from public, anon;
grant execute on function public.register_member_visit_from_qr(text, uuid, timestamptz) to authenticated, service_role;

revoke all on function public.register_member_visit_from_qr(text, uuid) from public, anon;
grant execute on function public.register_member_visit_from_qr(text, uuid) to authenticated, service_role;

revoke all on function public.register_member_visit_from_qr(text) from public, anon;
grant execute on function public.register_member_visit_from_qr(text) to authenticated, service_role;

revoke all on function public.rotate_attendance_qr_code(text) from public, anon;
grant execute on function public.rotate_attendance_qr_code(text) to authenticated, service_role;
