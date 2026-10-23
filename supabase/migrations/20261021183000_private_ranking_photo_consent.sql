-- Preparación SIN activar el acceso público a fotografías.
-- Las fotos originales siguen en el bucket PRIVADO dog-photos.
-- El consentimiento no puede ser escrito directamente por cliente.
BEGIN;

-- Bloqueo explícito, por defecto FALSE: la mera mención del término "foto pública"
-- en un aviso publicado NO significa aprobación de la finalidad opcional.
ALTER TABLE public.privacy_notices
  ADD COLUMN IF NOT EXISTS ranking_photo_publication_approved boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.dog_ranking_photo_consents (
  dog_id uuid PRIMARY KEY REFERENCES public.dogs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  granted_at timestamptz NOT NULL,
  revoked_at timestamptz NULL,
  notice_version text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dog_ranking_photo_notice_nonempty CHECK (length(trim(notice_version)) > 0)
);
ALTER TABLE public.dog_ranking_photo_consents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.dog_ranking_photo_consents FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.dog_ranking_photo_consents TO service_role;
-- Ninguna policy de usuario: el servicio de imágenes usa service_role DESPUÉS de verificar Auth.

CREATE TABLE IF NOT EXISTS public.dog_ranking_photo_consent_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  dog_id uuid NOT NULL,
  actor_user_id uuid NULL,
  action text NOT NULL CHECK (action IN ('grant', 'revoke', 'photo_changed')),
  notice_version text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.dog_ranking_photo_consent_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.dog_ranking_photo_consent_events FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.dog_ranking_photo_consent_events TO service_role;

CREATE OR REPLACE FUNCTION public.set_my_dog_ranking_photo_consent(
  p_dog_id uuid,
  p_enabled boolean
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user uuid := (SELECT auth.uid());
  v_dog record;
  v_notice text;
BEGIN
  IF v_user IS NULL OR p_dog_id IS NULL OR p_enabled IS NULL THEN
    RAISE EXCEPTION 'Sesión u opción inválida.';
  END IF;

  SELECT id, user_id, photo_path, is_active INTO v_dog
  FROM public.dogs WHERE id = p_dog_id FOR UPDATE;
  IF NOT FOUND OR v_dog.user_id IS DISTINCT FROM v_user THEN
    RAISE EXCEPTION 'No se encontró un perro de tu cuenta.';
  END IF;

  -- Revocar siempre es posible, incluso si el aviso o la foto cambiaron.
  IF NOT p_enabled THEN
    UPDATE public.dog_ranking_photo_consents
       SET revoked_at = now(), updated_at = now()
     WHERE dog_id = p_dog_id AND user_id = v_user AND revoked_at IS NULL;
    IF FOUND THEN
      INSERT INTO public.dog_ranking_photo_consent_events(dog_id, actor_user_id, action)
      VALUES (p_dog_id, v_user, 'revoke');
    END IF;
    RETURN false;
  END IF;

  IF v_dog.is_active IS DISTINCT FROM true OR v_dog.photo_path IS NULL OR length(trim(v_dog.photo_path)) = 0 THEN
    RAISE EXCEPTION 'Primero guarda una fotografía de tu perro.';
  END IF;

  -- El aviso no aprobado mantiene desactivada cualquier foto pública.
  -- Solo sirve el aviso ACTUAL, nunca uno retirado aunque siga en la tabla.
  SELECT version INTO v_notice
    FROM public.privacy_notices
   WHERE status = 'published'
   ORDER BY published_at DESC LIMIT 1;
  IF NOT EXISTS (
    SELECT 1 FROM public.privacy_notices
    WHERE status = 'published' AND version = v_notice
      AND version LIKE '1.4%'
      AND ranking_photo_publication_approved IS TRUE
      AND position('foto pública' IN lower(integral_notice)) > 0
      AND position('foto pública' IN lower(simplified_notice)) > 0
  ) THEN
    RAISE EXCEPTION 'Esta opción estará disponible cuando UCAPSA publique el aviso de privacidad correspondiente.';
  END IF;

  INSERT INTO public.dog_ranking_photo_consents
    (dog_id, user_id, granted_at, revoked_at, notice_version)
  VALUES (p_dog_id, v_user, now(), NULL, v_notice)
  ON CONFLICT (dog_id) DO UPDATE SET
    user_id = EXCLUDED.user_id,
    granted_at = EXCLUDED.granted_at,
    revoked_at = NULL,
    notice_version = EXCLUDED.notice_version,
    updated_at = now();

  INSERT INTO public.dog_ranking_photo_consent_events
    (dog_id, actor_user_id, action, notice_version)
  VALUES (p_dog_id, v_user, 'grant', v_notice);
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.set_my_dog_ranking_photo_consent(uuid,boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_my_dog_ranking_photo_consent(uuid,boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_my_dog_ranking_photo_consents()
RETURNS TABLE(dog_id uuid, enabled boolean, notice_version text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  WITH active_notice AS (
    SELECT version FROM public.privacy_notices
     WHERE status = 'published'
       AND version LIKE '1.4%'
       AND ranking_photo_publication_approved IS TRUE
       AND position('foto pública' IN lower(integral_notice)) > 0
       AND position('foto pública' IN lower(simplified_notice)) > 0
     ORDER BY published_at DESC LIMIT 1
  )
  SELECT d.id,
    (c.dog_id IS NOT NULL AND c.revoked_at IS NULL
      AND nullif(trim(d.photo_path), '') IS NOT NULL
      AND c.notice_version = (SELECT version FROM active_notice)
      AND (SELECT version FROM active_notice) IS NOT NULL),
    c.notice_version
  FROM public.dogs d
  LEFT JOIN public.dog_ranking_photo_consents c
    ON c.dog_id = d.id AND c.user_id = d.user_id
  WHERE d.user_id = (SELECT auth.uid()) AND d.is_active;
$$;
REVOKE ALL ON FUNCTION public.get_my_dog_ranking_photo_consents() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_dog_ranking_photo_consents() TO authenticated;

-- Cambiar o borrar la foto privada nunca puede publicar automáticamente la nueva.
CREATE OR REPLACE FUNCTION public.revoke_dog_ranking_photo_on_source_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.photo_path IS DISTINCT FROM OLD.photo_path
     OR NEW.user_id IS DISTINCT FROM OLD.user_id
     OR (OLD.is_active IS TRUE AND NEW.is_active IS FALSE) THEN
    UPDATE public.dog_ranking_photo_consents
       SET revoked_at = now(), updated_at = now()
     WHERE dog_id = NEW.id AND revoked_at IS NULL;
    IF FOUND THEN
      INSERT INTO public.dog_ranking_photo_consent_events(dog_id, actor_user_id, action)
      VALUES (NEW.id, (SELECT auth.uid()), 'photo_changed');
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS dogs_revoke_ranking_photo_on_change ON public.dogs;
CREATE TRIGGER dogs_revoke_ranking_photo_on_change
AFTER UPDATE OF photo_path, user_id, is_active ON public.dogs
FOR EACH ROW EXECUTE FUNCTION public.revoke_dog_ranking_photo_on_source_change();

COMMIT;
