-- Narrowly scoped RPCs. dog_profiles feature flag can be off while basic dog accounts stay usable.
-- SECURITY DEFINER is intentional; both functions guard auth.uid() and ownership.
BEGIN;
CREATE OR REPLACE FUNCTION public.get_my_dog_avatar_foregrounds()
RETURNS TABLE(dog_id uuid, avatar_foreground_color text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT d.id,d.avatar_foreground_color FROM public.dogs d
  WHERE d.user_id = (SELECT auth.uid()) AND d.is_active = true;
$$;
REVOKE ALL ON FUNCTION public.get_my_dog_avatar_foregrounds() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_dog_avatar_foregrounds() TO authenticated;

CREATE OR REPLACE FUNCTION public.set_my_dog_avatar_preferences(
  p_dog_id uuid, p_avatar_key text, p_avatar_color text, p_avatar_foreground_color text
) RETURNS TABLE(avatar_key text, avatar_color text, avatar_foreground_color text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_user uuid := (SELECT auth.uid());
BEGIN
  IF v_user IS NULL OR p_dog_id IS NULL OR p_avatar_key IS NULL OR p_avatar_color IS NULL THEN
    RAISE EXCEPTION 'Inicia sesión y selecciona un avatar.';
  END IF;
  IF p_avatar_key NOT IN (
    'dog_face','dog_side','poodle','guide_dog','service_dog','paw',
    'cartoon_dog','cartoon_dog_side','cartoon_paw','cartoon_bone',
    'dog_heart','dog_star','dog_sun','dog_moon','dog_play'
  ) THEN RAISE EXCEPTION 'Avatar inválido.'; END IF;
  IF p_avatar_color NOT IN (
    '#F2E3C6','#7A151E','#D4A62A','#3C6FC9',
    '#4D857A','#7A60A8','#D8814C','#C86B7A'
  ) THEN RAISE EXCEPTION 'Color de fondo inválido.'; END IF;

  IF p_avatar_foreground_color IS NOT NULL AND NOT (
    (p_avatar_color='#F2E3C6' AND p_avatar_foreground_color IN ('#4B2C20','#7A151E','#3C6FC9','#4D857A')) OR
    (p_avatar_color='#7A151E' AND p_avatar_foreground_color IN ('#FFFFFF','#D4A62A')) OR
    (p_avatar_color='#D4A62A' AND p_avatar_foreground_color IN ('#4B2C20','#7A151E')) OR
    (p_avatar_color='#3C6FC9' AND p_avatar_foreground_color='#FFFFFF') OR
    (p_avatar_color='#4D857A' AND p_avatar_foreground_color='#FFFFFF') OR
    (p_avatar_color='#7A60A8' AND p_avatar_foreground_color='#FFFFFF') OR
    (p_avatar_color='#D8814C' AND p_avatar_foreground_color IN ('#4B2C20','#7A151E')) OR
    (p_avatar_color='#C86B7A' AND p_avatar_foreground_color IN ('#4B2C20','#FFFFFF'))
  ) THEN
    RAISE EXCEPTION 'El dibujo y el fondo necesitan más contraste.';
  END IF;

  -- RLS para tabla completa puede estar desactivada por feature flag.
  -- En esta RPC solo se modifican preferencias del perro realmente propio.
  RETURN QUERY UPDATE public.dogs d SET
    avatar_key=p_avatar_key,avatar_color=p_avatar_color,
    avatar_foreground_color=p_avatar_foreground_color,updated_at=clock_timestamp()
  WHERE d.id=p_dog_id AND d.user_id=v_user AND d.is_active=true
  RETURNING d.avatar_key,d.avatar_color,d.avatar_foreground_color;
  IF NOT FOUND THEN RAISE EXCEPTION 'No se encontró el perro de tu cuenta.'; END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.set_my_dog_avatar_preferences(uuid,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_my_dog_avatar_preferences(uuid,text,text,text) TO authenticated;
COMMIT;
