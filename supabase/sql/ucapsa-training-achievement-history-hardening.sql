-- Formal training achievements are historical awards.
-- Remove the legacy SECURITY DEFINER RPC that could still delete the row even
-- after direct DELETE privileges were revoked from client roles.

drop function if exists public.admin_revoke_ucapsa_training_achievement(uuid,text);

revoke delete on table public.user_achievements from anon, authenticated;
