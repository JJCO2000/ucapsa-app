-- UCAPSA — lectura administrativa completa de anuncios y eventos
--
-- Corrige una regresión introducida al retirar las políticas admin_all:
-- las políticas SELECT por audiencia conservaban is_published/archived_at como
-- condición global, por lo que ni un admin podía volver a leer borradores o
-- contenido archivado para editarlo/restaurarlo.
--
-- Regla:
-- - anon no cambia;
-- - cliente autenticado sólo ve contenido publicado, no archivado y de su audiencia;
-- - admin/super_admin puede leer cualquier fila para administrar el historial.

drop policy if exists "announcements_authenticated_select_by_audience"
  on public.announcements;

create policy "announcements_authenticated_select_by_audience"
on public.announcements
for select
to authenticated
using (
  public.is_admin()
  or (
    is_published = true
    and archived_at is null
    and (
      audience = 'public'
      or (((select auth.uid()) is not null) and audience = 'clients')
      or (audience = 'members' and public.has_active_membership())
    )
  )
);

drop policy if exists "events_authenticated_select_by_audience"
  on public.events;

create policy "events_authenticated_select_by_audience"
on public.events
for select
to authenticated
using (
  public.is_admin()
  or (
    is_published = true
    and archived_at is null
    and (
      audience = 'public'
      or (((select auth.uid()) is not null) and audience = 'clients')
      or (audience = 'members' and public.has_active_membership())
    )
  )
);
