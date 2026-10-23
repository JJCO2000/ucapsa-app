-- Installed AFTER 20261023113000_family_capture_after_link.sql. Do not redefine existing capture rules.
-- UCAPSA: identidad personal y vínculo familiar separado, nunca propiedad compartida.
-- Requiere contacto previo + revisión presencial de Administración + consentimiento de ambas cuentas.
-- No crea usuarios, membresías, pagos, accesos de edición ni nuevos perros.
CREATE TABLE IF NOT EXISTS ucapsa_intake.family_account_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_member_id uuid NOT NULL UNIQUE REFERENCES ucapsa_intake.family_members(id) ON DELETE CASCADE,
  head_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  relative_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  authorized_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  verification_note text NOT NULL CHECK (length(btrim(verification_note)) BETWEEN 12 AND 400),
  authorized_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  head_consented_at timestamptz,
  relative_consented_at timestamptz,
  revoked_at timestamptz,
  CONSTRAINT family_link_distinct_accounts CHECK (head_user_id <> relative_user_id)
);
CREATE INDEX IF NOT EXISTS family_links_by_head
  ON ucapsa_intake.family_account_links(head_user_id);
CREATE INDEX IF NOT EXISTS family_links_by_relative
  ON ucapsa_intake.family_account_links(relative_user_id);
ALTER TABLE ucapsa_intake.family_account_links ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ucapsa_intake.family_account_links FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ucapsa_intake.family_account_links TO service_role;

-- Preview uses the exact contact of the invited family member, NOT the owner's contact
-- and no client-provided Auth UID. In-person Admin verification must follow.
CREATE OR REPLACE FUNCTION public.admin_preview_family_account(p_family_member_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE
  v_head uuid;
  v_link_id uuid;
  v_existing_revoked timestamptz;
  v_member_name text;
  v_email text;
  v_phone text;
  v_candidate uuid;
  v_count integer;
  v_account_name text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_ucapsa_admin() THEN
    RAISE EXCEPTION 'Solo Administración puede revisar esta vinculación.' USING errcode='42501';
  END IF;
  SELECT p.linked_user_id,f.full_name,f.email_key,f.phone_e164,l.id,l.revoked_at
    INTO v_head,v_member_name,v_email,v_phone,v_link_id,v_existing_revoked
    FROM ucapsa_intake.family_members f
    JOIN ucapsa_intake.people p ON p.id=f.person_id
    LEFT JOIN ucapsa_intake.family_account_links l ON l.family_member_id=f.id
    WHERE f.id=p_family_member_id AND p.status='linked';
  IF v_head IS NULL THEN RETURN jsonb_build_object('status','head_not_linked'); END IF;
  IF v_link_id IS NOT NULL AND v_existing_revoked IS NULL THEN
    RETURN jsonb_build_object('status','already_requested');
  END IF;
  SELECT count(*),min(candidate_id::text)::uuid INTO v_count,v_candidate FROM (
    SELECT u.id AS candidate_id FROM auth.users u
      WHERE v_email IS NOT NULL AND lower(btrim(u.email))=v_email
    UNION
    SELECT pr.user_id AS candidate_id FROM public.profiles pr
      WHERE v_phone IS NOT NULL AND pr.phone=v_phone
  ) candidates;
  IF v_count=0 THEN RETURN jsonb_build_object('status','no_account'); END IF;
  IF v_count<>1 OR v_candidate=v_head THEN
    RETURN jsonb_build_object('status','conflict');
  END IF;
  SELECT nullif(btrim(pr.full_name),'') INTO v_account_name
    FROM public.profiles pr WHERE pr.user_id=v_candidate;
  RETURN jsonb_build_object('status','available',
    'account_name',coalesce(v_account_name,v_member_name));
END;
$function$;
REVOKE ALL ON FUNCTION public.admin_preview_family_account(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_preview_family_account(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_authorize_family_account(
  p_family_member_id uuid,p_verification_note text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE
  v_head uuid;
  v_candidate uuid;
  v_count integer;
  v_email text;
  v_phone text;
  v_note text := btrim(coalesce(p_verification_note,''));
  v_member ucapsa_intake.family_members%ROWTYPE;
  v_link_id uuid;
  v_revoked_at timestamptz;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_ucapsa_admin() THEN
    RAISE EXCEPTION 'Solo Administración puede autorizar familiares.' USING errcode='42501';
  END IF;
  IF length(v_note) NOT BETWEEN 12 AND 400 THEN
    RAISE EXCEPTION 'Describe cómo comprobaste las dos identidades (mínimo 12 caracteres).'
      USING errcode='22023';
  END IF;
  SELECT * INTO v_member FROM ucapsa_intake.family_members
    WHERE id=p_family_member_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'No se encontró el familiar.' USING errcode='22023'; END IF;
  SELECT linked_user_id INTO v_head FROM ucapsa_intake.people
    WHERE id=v_member.person_id AND status='linked' FOR UPDATE;
  IF v_head IS NULL THEN
    RAISE EXCEPTION 'Primero el titular debe vincular su propia cuenta.' USING errcode='22023';
  END IF;
  SELECT id,revoked_at INTO v_link_id,v_revoked_at
    FROM ucapsa_intake.family_account_links WHERE family_member_id=p_family_member_id FOR UPDATE;
  IF v_link_id IS NOT NULL AND v_revoked_at IS NULL THEN
    RAISE EXCEPTION 'Esta vinculación familiar ya está autorizada.' USING errcode='23505';
  END IF;
  v_email := v_member.email_key;
  v_phone := v_member.phone_e164;
  SELECT count(*),min(candidate_id::text)::uuid INTO v_count,v_candidate FROM (
    SELECT u.id AS candidate_id FROM auth.users u
      WHERE v_email IS NOT NULL AND lower(btrim(u.email))=v_email
    UNION
    SELECT pr.user_id AS candidate_id FROM public.profiles pr
      WHERE v_phone IS NOT NULL AND pr.phone=v_phone
  ) candidates;
  IF v_count<>1 OR v_candidate=v_head THEN
    RAISE EXCEPTION 'No hay una cuenta única para el familiar; revisa sus contactos.'
      USING errcode='22023';
  END IF;
  IF v_link_id IS NOT NULL THEN
    UPDATE ucapsa_intake.family_account_links
      SET head_user_id=v_head,relative_user_id=v_candidate,
          authorized_by=auth.uid(),verification_note=v_note,
          authorized_at=clock_timestamp(),head_consented_at=NULL,
          relative_consented_at=NULL,revoked_at=NULL
      WHERE id=v_link_id;
  ELSE
    INSERT INTO ucapsa_intake.family_account_links (
      family_member_id,head_user_id,relative_user_id,authorized_by,verification_note
    ) VALUES (p_family_member_id,v_head,v_candidate,auth.uid(),v_note)
      RETURNING id INTO v_link_id;
  END IF;
  INSERT INTO public.admin_audit_logs(admin_user_id,action,entity_type,entity_id,details)
    VALUES (auth.uid(),'family.account_authorized','family_account_link',v_link_id,
      jsonb_build_object('family_member_id',p_family_member_id,
        'head_user_id',v_head,'relative_user_id',v_candidate,
        'verification_note',v_note));
  RETURN jsonb_build_object('status','pending_acceptance');
END;
$function$;
REVOKE ALL ON FUNCTION public.admin_authorize_family_account(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_authorize_family_account(uuid,text) TO authenticated;

-- Only the two actual accounts can see an invitation, and neither side inherits consent.
CREATE OR REPLACE FUNCTION public.get_my_family_account_links()
RETURNS TABLE(
  id uuid,other_name text,my_role text,
  my_accepted boolean,other_accepted boolean,active boolean
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $function$
  SELECT l.id,
    CASE WHEN auth.uid()=l.head_user_id THEN f.full_name
      ELSE p.owner_name END AS other_name,
    CASE WHEN auth.uid()=l.head_user_id THEN 'titular' ELSE 'familiar' END AS my_role,
    CASE WHEN auth.uid()=l.head_user_id THEN l.head_consented_at IS NOT NULL
      ELSE l.relative_consented_at IS NOT NULL END AS my_accepted,
    CASE WHEN auth.uid()=l.head_user_id THEN l.relative_consented_at IS NOT NULL
      ELSE l.head_consented_at IS NOT NULL END AS other_accepted,
    (l.head_consented_at IS NOT NULL AND l.relative_consented_at IS NOT NULL) AS active
  FROM ucapsa_intake.family_account_links l
    JOIN ucapsa_intake.family_members f ON f.id=l.family_member_id
    JOIN ucapsa_intake.people p ON p.id=f.person_id
  WHERE auth.uid() IS NOT NULL AND l.revoked_at IS NULL
    AND p.linked_user_id=l.head_user_id AND p.status='linked'
    AND auth.uid() IN (l.head_user_id,l.relative_user_id)
  ORDER BY l.authorized_at DESC;
$function$;
REVOKE ALL ON FUNCTION public.get_my_family_account_links() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_my_family_account_links() TO authenticated;

CREATE OR REPLACE FUNCTION public.set_my_family_progress_consent(
  p_link_id uuid,p_accept boolean
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE v_link ucapsa_intake.family_account_links%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Inicia sesión para autorizar.' USING errcode='42501';
  END IF;
  SELECT l.* INTO v_link FROM ucapsa_intake.family_account_links l
    JOIN ucapsa_intake.family_members f ON f.id=l.family_member_id
    JOIN ucapsa_intake.people p ON p.id=f.person_id
    WHERE l.id=p_link_id AND l.revoked_at IS NULL
      AND p.status='linked' AND p.linked_user_id=l.head_user_id
      AND auth.uid() IN (l.head_user_id,l.relative_user_id)
    FOR UPDATE OF l;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No tienes acceso a esta solicitud familiar.' USING errcode='42501';
  END IF;
  IF auth.uid()=v_link.head_user_id THEN
    UPDATE ucapsa_intake.family_account_links
      SET head_consented_at=CASE WHEN p_accept THEN clock_timestamp() ELSE NULL END
      WHERE id=p_link_id;
  ELSE
    UPDATE ucapsa_intake.family_account_links
      SET relative_consented_at=CASE WHEN p_accept THEN clock_timestamp() ELSE NULL END
      WHERE id=p_link_id;
  END IF;
  RETURN jsonb_build_object('status','updated');
END;
$function$;
REVOKE ALL ON FUNCTION public.set_my_family_progress_consent(uuid,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.set_my_family_progress_consent(uuid,boolean) TO authenticated;

-- Explicitly curated read-only summary; never return contact info, dog photos,
-- medical details, memberships, payments, attendance records or control IDs.
CREATE OR REPLACE FUNCTION public.get_my_family_progress()
RETURNS TABLE (
  owner_name text,dog_name text,program_name text,
  program_level text,attendances_count integer
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $function$
  WITH approved AS (
    SELECT DISTINCT CASE WHEN auth.uid()=l.head_user_id THEN l.relative_user_id
      ELSE l.head_user_id END AS partner_id
    FROM ucapsa_intake.family_account_links l
      JOIN ucapsa_intake.family_members f ON f.id=l.family_member_id
      JOIN ucapsa_intake.people p ON p.id=f.person_id
    WHERE auth.uid() IS NOT NULL AND l.revoked_at IS NULL
      AND p.status='linked' AND p.linked_user_id=l.head_user_id
      AND auth.uid() IN (l.head_user_id,l.relative_user_id)
      AND l.head_consented_at IS NOT NULL AND l.relative_consented_at IS NOT NULL
  )
  SELECT coalesce(nullif(btrim(pr.full_name),''),'Integrante') AS owner_name,
    d.name AS dog_name,pro.name AS program_name,
    pe.program_level,pe.attendances_count
  FROM approved a
  JOIN public.profiles pr ON pr.user_id=a.partner_id
  JOIN public.dogs d ON d.user_id=a.partner_id AND d.is_active
  LEFT JOIN LATERAL (
    SELECT e.program_id,e.program_level,e.attendances_count
      FROM public.program_enrollments e
      WHERE e.user_id=a.partner_id AND e.dog_id=d.id
        AND e.status IN ('active','completed')
      ORDER BY e.updated_at DESC,e.id DESC LIMIT 1
  ) pe ON true
  LEFT JOIN public.programs pro ON pro.id=pe.program_id
  ORDER BY owner_name,dog_name,program_name
  LIMIT 200;
$function$;
REVOKE ALL ON FUNCTION public.get_my_family_progress() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_my_family_progress() TO authenticated;


-- Administración revoca relaciones erróneas; nunca expone datos después de revocar.
CREATE OR REPLACE FUNCTION public.admin_revoke_family_account(
  p_family_member_id uuid,p_reason text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE v_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_ucapsa_admin() THEN
    RAISE EXCEPTION 'Solo Administración puede revocar esta vinculación.' USING errcode='42501';
  END IF;
  IF length(btrim(coalesce(p_reason,''))) NOT BETWEEN 12 AND 400 THEN
    RAISE EXCEPTION 'Escribe el motivo de la corrección (mínimo 12 caracteres).' USING errcode='22023';
  END IF;
  UPDATE ucapsa_intake.family_account_links
    SET revoked_at=clock_timestamp(),head_consented_at=NULL,relative_consented_at=NULL
    WHERE family_member_id=p_family_member_id AND revoked_at IS NULL
    RETURNING id INTO v_id;
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'No existe una vinculación familiar activa para revocar.' USING errcode='22023';
  END IF;
  INSERT INTO public.admin_audit_logs(admin_user_id,action,entity_type,entity_id,details)
    VALUES (auth.uid(),'family.account_revoked','family_account_link',v_id,
      jsonb_build_object('reason',btrim(p_reason)));
  RETURN jsonb_build_object('status','revoked');
END;
$function$;
REVOKE ALL ON FUNCTION public.admin_revoke_family_account(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_revoke_family_account(uuid,text) TO authenticated;
