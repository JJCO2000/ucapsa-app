import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useEffect, useRef } from 'react';

import { devWarn } from '../lib/client-diagnostics';

type NotificationData = Record<string, unknown>;

type NotificationResponse = {
  notification: {
    request: {
      identifier?: string;
      content: {
        data?: NotificationData;
      };
    };
  };
};

type NotificationsModule = {
  addNotificationResponseReceivedListener: (
    listener: (response: NotificationResponse) => void,
  ) => { remove: () => void };
  getLastNotificationResponseAsync: () => Promise<NotificationResponse | null>;
  clearLastNotificationResponseAsync: () => Promise<void>;
};

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function notificationRouteFromData(data: NotificationData | undefined) {
  const source = stringValue(data?.source);
  const category = stringValue(data?.category);

  if (source === 'class_cancellation' || source === 'class_reminder' || category === 'classes') {
    const date = stringValue(data?.cancellation_date) ?? stringValue(data?.class_date);
    return date && /^\d{4}-\d{2}-\d{2}$/.test(date)
      ? `/calendar?date=${encodeURIComponent(date)}`
      : '/calendar';
  }

  if (category === 'membership') return '/client/membership';
  if (category === 'achievements') return '/dog';
  if (category === 'announcements_events' || source === 'announcement_reminder') return '/announcements';

  return '/home';
}

export function useNotificationNavigation(enabled: boolean) {
  const handledResponseRef = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled || Constants.appOwnership === 'expo') return undefined;

    let active = true;
    let subscription: { remove: () => void } | null = null;

    const handle = (response: NotificationResponse | null) => {
      if (!active || !response) return;
      const identifier = response.notification.request.identifier ?? null;
      if (identifier && handledResponseRef.current === identifier) return;
      if (identifier) handledResponseRef.current = identifier;

      const data = response.notification.request.content.data;
      router.push(notificationRouteFromData(data) as never);
    };

    void import('expo-notifications')
      .then((module) => {
        if (!active) return;
        const Notifications = module as unknown as NotificationsModule;
        subscription = Notifications.addNotificationResponseReceivedListener(handle);
        return Notifications.getLastNotificationResponseAsync().then(async (response) => {
          handle(response ?? null);
          if (response) await Notifications.clearLastNotificationResponseAsync();
        });
      })
      .catch((error) => {
        // Mejora progresiva: no bloquea el arranque, pero deja diagnóstico para soporte.
        devWarn('No se pudo inicializar la navegación desde push.', error);
      });

    return () => {
      active = false;
      subscription?.remove();
    };
  }, [enabled]);
}
