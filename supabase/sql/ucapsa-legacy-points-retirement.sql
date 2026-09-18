-- Retiro seguro del sistema histórico UCAPSA Points.
--
-- Rango 1 es la fuente canónica actual. Este archivo NO borra temporadas,
-- participantes ni ledger históricos. Sólo impide que el sistema legado siga
-- generando o ajustando una segunda verdad en paralelo.

drop trigger if exists award_ucapsa_point_after_program_attendance
  on public.program_attendances;

revoke all on function public.admin_adjust_ucapsa_points(uuid, uuid, integer, text)
  from public, anon, authenticated;

-- El leaderboard histórico queda de sólo lectura por compatibilidad con
-- clientes antiguos. No debe usarse en nuevas superficies.
