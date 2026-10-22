-- Avatar simple: escoger entre los 15 dibujos existentes y un color de fondo.
-- El permiso se comprueba en el servidor; NO activar dog_profiles ni conceder UPDATE general.
CREATE OR REPLACE FUNCTION public.set_my_dog_avatar_basic(
  p_dog_id uuid, p_avatar_key text, p_avatar_color text
)
RETURNS TABLE(avatar_key text, avatar_color text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_owner uuid := (SELECT auth.uid());
BEGIN
  IF v_owner IS NULL OR p_dog_id IS NULL OR p_avatar_key IS NULL OR p_avatar_color IS NULL THEN
    RAISE EXCEPTION 'Inicia sesión y selecciona tu avatar.';
  END IF;
  IF p_avatar_key NOT IN (
    'dog_face','dog_side','poodle','guide_dog','service_dog','paw',
    'cartoon_dog','cartoon_dog_side','cartoon_paw','cartoon_bone',
    'dog_heart','dog_star','dog_sun','dog_moon','dog_play'
  ) THEN
    RAISE EXCEPTION 'Avatar inválido.';
  END IF;
  IF p_avatar_color NOT IN (
    '#F2E3C6','#7A151E','#D4A62A','#3C6FC9',
    '#4D857A','#7A60A8','#D8814C','#C86B7A'
  ) THEN
    RAISE EXCEPTION 'Color inválido.';
  END IF;
  RETURN QUERY UPDATE public.dogs d
    SET avatar_key=p_avatar_key, avatar_color=p_avatar_color,
        updated_at=clock_timestamp()
    WHERE d.id=p_dog_id AND d.user_id=v_owner AND d.is_active=true
    RETURNING d.avatar_key,d.avatar_color;
  IF NOT FOUND THEN RAISE EXCEPTION 'No se encontró un perro de tu cuenta.'; END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.set_my_dog_avatar_basic(uuid,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_my_dog_avatar_basic(uuid,text,text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.set_my_dog_avatar_preferences(uuid,text,text,text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_my_dog_avatar_foregrounds() FROM authenticated;
