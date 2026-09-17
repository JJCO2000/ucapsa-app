-- UCAPSA Rango 1 — hardening de reversión de importación de Exámenes
--
-- Revertir un lote no borra intentos/resultados canónicos: los anula.
-- Así se conserva trazabilidad y se evita pelear con el snapshot staging.
-- Un lote con resultados publicados/oficiales sigue sin ser reversible en bloque.

create or replace function public.admin_revert_ucapsa_exam_import_batch(p_batch_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_batch public.ucapsa_import_batches%rowtype;
  v_attempt record;
  v_voided_count integer := 0;
begin
  if not public.is_ucapsa_admin() then
    raise exception 'Solo Admin puede revertir importaciones UCAPSA.';
  end if;

  select * into v_batch
  from public.ucapsa_import_batches
  where id=p_batch_id
  for update;

  if not found or v_batch.import_type<>'exam_results' then
    raise exception 'Lote no encontrado.';
  end if;
  if v_batch.status<>'committed' then
    raise exception 'Solo un lote committed puede revertirse.';
  end if;

  perform public.ucapsa_assert_competition_season_mutable(v_batch.season_id);

  if exists (
    select 1
    from public.ucapsa_exam_attempts a
    where a.import_batch_id=p_batch_id
      and (a.status='published' or a.is_official=true)
  ) then
    raise exception 'Un lote con resultados publicados no puede revertirse. Anula/corrige los intentos publicados.'
      using errcode='55000';
  end if;

  for v_attempt in
    select a.id,a.status
    from public.ucapsa_exam_attempts a
    where a.import_batch_id=p_batch_id
    order by a.created_at,a.id
  loop
    if v_attempt.status <> 'voided' then
      perform public.admin_void_ucapsa_exam_attempt(v_attempt.id);
      v_voided_count := v_voided_count + 1;
    end if;
  end loop;

  update public.ucapsa_import_batches
  set status='reverted',
      reverted_at=now(),
      metadata=metadata || jsonb_build_object(
        'reverted_at',now(),
        'voided_attempts',v_voided_count
      )
  where id=p_batch_id;

  perform public.ucapsa_exam_admin_audit(
    'ucapsa_exam_import.revert','ucapsa_import_batch',p_batch_id,
    jsonb_build_object('voided_attempts',v_voided_count)
  );

  return p_batch_id;
end;
$$;

revoke all on function public.admin_revert_ucapsa_exam_import_batch(uuid)
  from public, anon, authenticated;
grant execute on function public.admin_revert_ucapsa_exam_import_batch(uuid)
  to authenticated;
