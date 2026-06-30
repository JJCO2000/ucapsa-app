import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';

import {
  disableStoredExpoPushToken,
  getNotificationPreferences,
  getStoredExpoPushToken,
  registerExpoPushToken,
  updateNotificationPreferences,
} from '../services/notifications.service';
import type { NotificationCategoryKey, NotificationPreferences } from '../types/app.types';

type NotificationRuntimeState = 'idle' | 'loading' | 'saving' | 'registering';

function getExpoProjectId() {
  return Constants.expoConfig?.extra?.eas?.projectId ?? (Constants as any).easConfig?.projectId ?? null;
}

function getAppVersion() {
  return Constants.expoConfig?.version ?? null;
}

function getAppOwnership() {
  return Constants.appOwnership ?? null;
}

export function useNotifications() {
  const [preferences, setPreferences] = useState<NotificationPreferences | null>(null);
  const [permissionStatus, setPermissionStatus] = useState<string>('unknown');
  const [expoPushToken, setExpoPushToken] = useState<string | null>(null);
  const [runtimeState, setRuntimeState] = useState<NotificationRuntimeState>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const projectId = useMemo(() => getExpoProjectId(), []);
  const isExpoGo = Constants.appOwnership === 'expo';
  const canUsePush = Device.isDevice && !isExpoGo;

  const refresh = useCallback(async () => {
    setRuntimeState('loading');
    setErrorMessage(null);

    try {
      const [nextPreferences, permissions, storedToken] = await Promise.all([
        getNotificationPreferences(),
        Notifications.getPermissionsAsync().catch(() => null),
        getStoredExpoPushToken(),
      ]);

      setPreferences(nextPreferences);
      setPermissionStatus(permissions?.status ?? 'unknown');
      setExpoPushToken(storedToken);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'No se pudieron cargar las notificaciones.');
    } finally {
      setRuntimeState('idle');
    }
  }, []);

  const requestAndRegisterDevice = useCallback(async () => {
    if (!Device.isDevice) {
      throw new Error('Las notificaciones push reales se prueban en un celular fisico o build compatible, no en web.');
    }

    if (isExpoGo) {
      throw new Error('Las push reales no se prueban bien en Expo Go. Usa un development build o APK de EAS.');
    }

    if (!projectId) {
      throw new Error('Falta projectId de EAS en app.json. Revisa expo.extra.eas.projectId.');
    }

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'UCAPSA',
        importance: Notifications.AndroidImportance.MAX,
      });
    }

    const existingPermission = await Notifications.getPermissionsAsync();
    let finalStatus = existingPermission.status;

    if (existingPermission.status !== 'granted') {
      const requestedPermission = await Notifications.requestPermissionsAsync();
      finalStatus = requestedPermission.status;
    }

    setPermissionStatus(finalStatus);

    if (finalStatus !== 'granted') {
      throw new Error('El permiso de notificaciones no fue concedido. Activalo desde ajustes del sistema o intenta de nuevo.');
    }

    const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;

    await registerExpoPushToken({
      expoPushToken: token,
      platform: Platform.OS,
      deviceName: Device.deviceName ?? null,
      deviceId: Device.osBuildId ?? null,
      appOwnership: getAppOwnership(),
      appVersion: getAppVersion(),
      projectId,
    });

    setExpoPushToken(token);
    return token;
  }, [isExpoGo, projectId]);

  const setNotificationsEnabled = useCallback(
    async (enabled: boolean) => {
      setRuntimeState(enabled ? 'registering' : 'saving');
      setErrorMessage(null);

      try {
        if (enabled) {
          await requestAndRegisterDevice();
          const nextPreferences = await updateNotificationPreferences({ enabled: true });
          setPreferences(nextPreferences);
          return;
        }

        const nextPreferences = await updateNotificationPreferences({ enabled: false });
        setPreferences(nextPreferences);
        await disableStoredExpoPushToken();
        setExpoPushToken(null);
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : 'No se pudo actualizar la configuracion.');
      } finally {
        setRuntimeState('idle');
      }
    },
    [requestAndRegisterDevice],
  );

  const setCategoryEnabled = useCallback(async (key: NotificationCategoryKey, enabled: boolean) => {
    setRuntimeState('saving');
    setErrorMessage(null);

    try {
      const nextPreferences = await updateNotificationPreferences({ [key]: enabled });
      setPreferences(nextPreferences);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'No se pudo actualizar la categoria.');
    } finally {
      setRuntimeState('idle');
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    preferences,
    permissionStatus,
    expoPushToken,
    canUsePush,
    isExpoGo,
    projectId,
    loading: runtimeState === 'loading',
    saving: runtimeState === 'saving',
    registering: runtimeState === 'registering',
    errorMessage,
    refresh,
    setNotificationsEnabled,
    setCategoryEnabled,
  };
}
