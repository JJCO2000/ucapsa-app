-- Historical record: this migration temporarily granted the advanced RPCs.
-- Superseded by 20261022061930; kept to match Supabase's applied history.
GRANT EXECUTE ON FUNCTION public.get_my_dog_avatar_foregrounds() TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_my_dog_avatar_preferences(uuid,text,text,text) TO authenticated;
REVOKE ALL ON FUNCTION public.get_my_dog_avatar_foregrounds() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_my_dog_avatar_preferences(uuid,text,text,text) FROM PUBLIC, anon;
