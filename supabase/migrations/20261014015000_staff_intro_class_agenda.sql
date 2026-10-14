-- El Entrenador necesita nombres solo para la visita inicial, sin abrir perfiles/perros globalmente.
create or replace function public.get_staff_intro_class_agenda(p_class_date date)
returns table (
  id uuid, user_id uuid, dog_id uuid, schedule_id uuid, class_date date,
  status text, client_name text, dog_name text
)
language plpgsql stable security definer
set search_path = public, pg_temp
as $function$
begin
  if not public.is_ucapsa_staff() then
    raise exception 'Solo el personal de UCAPSA puede consultar visitas iniciales.'
      using errcode = '42501';
  end if;
  return query
    select a.id,a.user_id,a.dog_id,a.schedule_id,a.class_date,a.status,
      coalesce(nullif(pr.full_name,''),pr.email,'Cliente UCAPSA')::text,
      coalesce(d.name,'Perro')::text
    from public.intro_class_agenda_plans a
    join public.dogs d on d.id=a.dog_id
    left join public.profiles pr on pr.user_id=a.user_id
    where a.class_date=p_class_date and a.status <> 'cancelled'
    order by a.created_at,a.id;
end
$function$;
revoke all on function public.get_staff_intro_class_agenda(date) from public,anon;
grant execute on function public.get_staff_intro_class_agenda(date) to authenticated;
