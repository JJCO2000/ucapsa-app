\set ON_ERROR_STOP on
do $guard$ begin
 if current_database()<>'ucapsa_restaurant_test' then
   raise exception 'Refusing non-test DB';
 end if;
end $guard$;

set role anon;
do $before$
begin
 if not public.is_restaurant_menu_published() then
  raise exception 'Legacy visible menu must remain visible after migration';
 end if;
end $before$;
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',false);
do $client_denied$
declare blocked boolean:=false;
begin
 begin
   perform public.admin_set_restaurant_menu_published(true);
 exception when insufficient_privilege then blocked:=true;
 end;
 if not blocked then raise exception 'Client published menu'; end if;
end $client_denied$;
reset role;

-- An admin can hide the inherited visible menu without hiding individual products.
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);
select public.admin_set_restaurant_menu_published(false);
reset role;
update public.restaurant_menu_items set is_available=false;

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);
do $no_product$
declare rejected boolean:=false;
begin
 begin
   perform public.admin_set_restaurant_menu_published(true);
 exception when invalid_parameter_value then rejected:=true;
 end;
 if not rejected then raise exception 'Menu published with no products'; end if;
end $no_product$;
reset role;

insert into public.restaurant_menu_categories(id,is_active)
values('00000000-0000-4000-8000-000000000010',true);
insert into public.restaurant_menu_items(category_id,is_available)
values('00000000-0000-4000-8000-000000000010',false);
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);
do $no_available$
declare rejected boolean:=false;
begin
 begin
   perform public.admin_set_restaurant_menu_published(true);
 exception when invalid_parameter_value then rejected:=true;
 end;
 if not rejected then raise exception 'Menu published with unavailable item'; end if;
end $no_available$;
reset role;
update public.restaurant_menu_items set is_available=true;

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);
select public.admin_set_restaurant_menu_published(true);
select public.admin_set_restaurant_menu_published(true);
reset role;
set role anon;
do $published$
begin
 if not public.is_restaurant_menu_published() then
  raise exception 'Public menu did not become published';
 end if;
end $published$;
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);
select public.admin_set_restaurant_menu_published(false);
reset role;
set role anon;
do $unpublished$
begin
 if public.is_restaurant_menu_published() then
  raise exception 'Global menu publication not revoked';
 end if;
end $unpublished$;
reset role;
do $audit$
begin
 if (select count(*) from public.admin_audit_logs where action='restaurant.menu_publication')<>3 then
  raise exception 'Publication audit must count legacy true->false, false->true and true->false';
 end if;
 if (select count(*) from public.restaurant_menu_items where is_available)<>2 then
  raise exception 'Global switch changed individual product availability';
 end if;
end $audit$;
select 'UCAPSA restaurant publication SSOT: PASS' result;
