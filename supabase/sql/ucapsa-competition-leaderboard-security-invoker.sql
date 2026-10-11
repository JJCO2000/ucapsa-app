-- UCAPSA — restore security_invoker on competition leaderboard.
--
-- The avatar preset migration recreated the view without the original
-- security_invoker option. Client reads still go through the guarded
-- SECURITY DEFINER RPC, while Admin can read the view directly under RLS.

alter view public.ucapsa_competition_leaderboard
  set (security_invoker = true);

comment on view public.ucapsa_competition_leaderboard is
  'Ranking competitivo con security_invoker. Clientes consumen la RPC canónica; Admin directo respeta RLS.';
