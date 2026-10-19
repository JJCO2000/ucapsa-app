-- UCAPSA restaurante: publicar menú ≠ activar categoría ni producto.
-- Configuración SSOT privada; solamente un RPC público expone booleano.
create schema if not exists ucapsa_config;
revoke all on schema ucapsa_config from public, anon, authenticated;

create table if not exists ucapsa_config.restaurant_publication (
  id boolean primary key default true check(id),
  is_published boolean not null default false,
  updated_by uuid references auth.users(id) on delete restrict,
  updated_at timestamptz not null default now()
);
alter table ucapsa_config.restaurant_publication enable row level security;
revoke all on ucapsa_config.restaurant_publication from public, anon, authenticated;
-- Migración sin interrupción: conserva la visibilidad previa del menú de producción.
-- No publica productos ocultos ni cambia el estado de categorías o artículos.
insert into ucapsa_config.restaurant_publication(id,is_published)
select true, exists (
  select 1 from public.restaurant_menu_categories c
  join public.restaurant_menu_items i on i.category_id=c.id
  where c.is_active=true and i.is_available=true
)
on conflict(id) do nothing;

-- No expone personas, contactos, pagos ni IDs del administrador.
create or replace function public.is_restaurant_menu_published()
returns boolean language sql stable security definer set search_path=''
as $fn$
  select coalesce((select p.is_published
    from ucapsa_config.restaurant_publication p where p.id=true),false)
    and exists (
      select 1 from public.restaurant_menu_categories c
      join public.restaurant_menu_items i on i.category_id=c.id
      where c.is_active=true and i.is_available=true
    )
$fn$;
revoke all on function public.is_restaurant_menu_published() from public;
grant execute on function public.is_restaurant_menu_published() to anon,authenticated,service_role;

create or replace function public.admin_set_restaurant_menu_published(p_published boolean)
returns boolean language plpgsql security definer set search_path=''
as $fn$
declare
  v_actor uuid:=auth.uid();
  v_previous boolean;
begin
  if v_actor is null or not public.is_ucapsa_admin() then
    raise exception 'Solo Admin o Superadmin puede publicar el menú.'
      using errcode='42501';
  end if;
  if p_published is null then
    raise exception 'Se requiere publicar u ocultar.' using errcode='22023';
  end if;

  -- El menú solamente se publica si tiene al menos un artículo realmente visible.
  if p_published and not exists(
    select 1 from public.restaurant_menu_categories c
    join public.restaurant_menu_items i on i.category_id=c.id
    where c.is_active=true and i.is_available=true
  ) then
    raise exception 'No existen productos disponibles en categorías activas.'
      using errcode='22023';
  end if;

  select p.is_published into v_previous
  from ucapsa_config.restaurant_publication p where p.id=true for update;
  if v_previous is distinct from p_published then
    update ucapsa_config.restaurant_publication
      set is_published=p_published,updated_by=v_actor,updated_at=clock_timestamp()
      where id=true;
    insert into public.admin_audit_logs(admin_user_id,action,entity_type,entity_id,details)
    values(v_actor,'restaurant.menu_publication','restaurant_menu',null,
      pg_catalog.jsonb_build_object('from',v_previous,'to',p_published));
  end if;
  return p_published;
end;
$fn$;
revoke all on function public.admin_set_restaurant_menu_published(boolean) from public,anon;
grant execute on function public.admin_set_restaurant_menu_published(boolean)
  to authenticated;
