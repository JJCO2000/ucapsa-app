-- Restores the invoker security boundary after adding the avatar color column.
-- Without this flag, PostgreSQL views can bypass underlying RLS.
ALTER VIEW public.ucapsa_competition_leaderboard SET (security_invoker = true);
