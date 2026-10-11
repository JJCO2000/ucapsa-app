import { router, useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { BackHandler } from 'react-native';

export function useReturnToProfile(enabled: boolean) {
  const backToProfile = useCallback(() => {
    router.replace('/profile' as never);
  }, []);

  useFocusEffect(useCallback(() => {
    if (!enabled) return undefined;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      backToProfile();
      return true;
    });
    return () => subscription.remove();
  }, [backToProfile, enabled]));

  return backToProfile;
}
