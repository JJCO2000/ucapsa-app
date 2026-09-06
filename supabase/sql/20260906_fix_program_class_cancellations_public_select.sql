-- Remediacion 1.2: elimina la policy SELECT demasiado amplia.
-- program_class_cancellations_select_all usaba USING (true), por lo que al ser
-- PERMISSIVE anulaba en la practica el filtro restored_at IS NULL de las
-- policies publicas restantes.

drop policy if exists program_class_cancellations_select_all
on public.program_class_cancellations;
