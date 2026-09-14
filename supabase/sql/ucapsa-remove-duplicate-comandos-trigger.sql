-- UCAPSA — limpieza defensiva de progresión duplicada.
-- La progresión oficial vive en trg_ucapsa_unlock_next_program_stage.
-- Este archivo elimina un trigger auxiliar que llegó a producción durante la
-- validación y que no debe coexistir con el flujo consolidado.

drop trigger if exists trg_unlock_next_comandos_level on public.program_enrollments;
drop function if exists public.unlock_next_comandos_level_on_completion();
