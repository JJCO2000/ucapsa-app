-- Final least-privilege state: only set_my_dog_avatar_basic is available to clients.
-- No changes to stored photos, existing avatar choices, or colors.
REVOKE EXECUTE ON FUNCTION public.set_my_dog_avatar_preferences(uuid,text,text,text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_my_dog_avatar_foregrounds() FROM authenticated;
