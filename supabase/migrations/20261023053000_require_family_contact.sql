-- Solo datos de contacto familiar: no exige confirmación de email, no crea Auth ni concede acceso.
-- Esta restricción aplica a miembros NUEVOS; no modifica registros ya capturados.
ALTER TABLE ucapsa_intake.family_members
  ADD CONSTRAINT intake_family_contact_required
  CHECK (email_key IS NOT NULL OR phone_e164 IS NOT NULL) NOT VALID;

-- Reutilizar validación central dentro de RPCs existentes; evita bypass desde llamadas directas.
CREATE OR REPLACE FUNCTION ucapsa_intake.append_family_for_dog(p_dog_id uuid, p_members jsonb)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $function$
DECLARE
  v_person_id uuid;
  v_status text;
  v_item jsonb;
  v_name text;
  v_email text;
  v_phone text;
BEGIN
  IF p_members IS NULL OR jsonb_typeof(p_members) <> 'array'
      OR jsonb_array_length(p_members) > 30 THEN
    RAISE EXCEPTION 'Revisa la lista de familiares.' USING errcode='22023';
  END IF;
  IF jsonb_array_length(p_members)=0 THEN RETURN; END IF;
  SELECT d.person_id, p.status INTO v_person_id, v_status
    FROM ucapsa_intake.dogs d
    JOIN ucapsa_intake.people p ON p.id=d.person_id
    WHERE d.id=p_dog_id FOR UPDATE OF p;
  IF v_person_id IS NULL OR v_status <> 'pending' THEN
    RAISE EXCEPTION 'Solo pueden agregarse familiares a preinscripciones pendientes.' USING errcode='22023';
  END IF;
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_members) LOOP
    IF jsonb_typeof(v_item) <> 'object' THEN
      RAISE EXCEPTION 'Revisa los datos del integrante.' USING errcode='22023';
    END IF;
    v_name := btrim(coalesce(v_item->>'full_name',''));
    v_email := nullif(lower(btrim(coalesce(v_item->>'email',''))),'');
    v_phone := nullif(btrim(coalesce(v_item->>'phone','')),'');
    IF length(v_name) NOT BETWEEN 2 AND 120 OR v_name ~ '[[:cntrl:]]'
      OR (v_email IS NULL AND v_phone IS NULL)
      OR (v_email IS NOT NULL AND (length(v_email)>254
        OR v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'))
      OR (v_phone IS NOT NULL AND v_phone !~ '^\+[1-9][0-9]{7,14}$') THEN
      RAISE EXCEPTION 'Cada familiar necesita nombre y correo o celular válido.'
        USING errcode='22023';
    END IF;
    INSERT INTO ucapsa_intake.family_members(person_id,full_name,email_key,phone_e164,created_by)
      VALUES (v_person_id,v_name,v_email,v_phone,auth.uid())
      ON CONFLICT DO NOTHING;
  END LOOP;
END;
$function$;
REVOKE ALL ON FUNCTION ucapsa_intake.append_family_for_dog(uuid,jsonb)
  FROM PUBLIC, anon, authenticated;
