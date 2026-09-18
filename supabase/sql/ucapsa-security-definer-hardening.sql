-- UCAPSA security hardening: internal SECURITY DEFINER helpers must not be RPC surface.
--
-- PostgreSQL function EXECUTE defaults to PUBLIC unless it is revoked.
-- These routines are trigger/event-trigger helpers, except
-- ucapsa_unlock_next_comandos_level(uuid), which is invoked by its trigger
-- and may be used by trusted service-role maintenance.

revoke all on function public.enforce_lifetime_membership() from public, anon, authenticated;
revoke all on function public.ensure_program_enrollment_dog_link() from public, anon, authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.rls_auto_enable() from public, anon, authenticated;
revoke all on function public.trg_ucapsa_unlock_next_comandos_level() from public, anon, authenticated;
revoke all on function public.validate_payment_obligation_owner() from public, anon, authenticated;

revoke all on function public.ucapsa_unlock_next_comandos_level(uuid) from public, anon, authenticated;
grant execute on function public.ucapsa_unlock_next_comandos_level(uuid) to service_role;
