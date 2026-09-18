-- Preserve program enrollment history and its dependent evidence.
--
-- program_attendances and program_exams reference program_enrollments with
-- ON DELETE CASCADE. UCAPSA already has logical cancellation via status='cancelled'
-- and cancelled_at, so normal authenticated flows must never delete enrollment rows.

drop policy if exists "program_enrollments_super_admin_delete"
  on public.program_enrollments;

revoke delete on table public.program_enrollments
  from authenticated;
