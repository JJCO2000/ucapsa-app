import AsyncStorage from '@react-native-async-storage/async-storage';
import { devWarn } from '../lib/client-diagnostics';
import { getNotificationPreferences } from './notifications.service';
import type { IntroAgendaPlan } from './intro-class-agenda.service';

// Recordatorio exclusivamente local para visitas iniciales no inscritas.
// Las clases con inscripción usan el cron de recordatorios 24 h existente.
export async function syncIntroAgendaLocalReminder(
  userId: string,
  classDate: string,
  plans: readonly IntroAgendaPlan[],
): Promise<'scheduled' | 'off' | 'unsupported'> {
  const key = `@ucapsa:intro-reminder:${userId}:${classDate}`;
  try {
    const Notifications = await import('expo-notifications');
    const existingId = await AsyncStorage.getItem(key);
    const active = plans.some(p => p.class_date === classDate && (p.status === 'planned' || p.status === 'yes'));
    const reminderAt = new Date(`${classDate}T10:00:00-06:00`).getTime() - 24 * 60 * 60 * 1000;
    const preferences = await getNotificationPreferences();
    if (!active || !preferences.enabled || !preferences.classes || reminderAt <= Date.now()) {
      if (existingId) await Notifications.cancelScheduledNotificationAsync(existingId);
      await AsyncStorage.removeItem(key);
      return 'off';
    }
    if (existingId) {
      const entries = await Notifications.getAllScheduledNotificationsAsync();
      if (entries.some(item => item.identifier === existingId)) return 'scheduled';
    }
    const current = await Notifications.getPermissionsAsync();
    const granted = current.granted || (await Notifications.requestPermissionsAsync()).granted;
    if (!granted) return 'unsupported';
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Mañana: Puppy inicial · 10:00',
        body: 'Revisa tu agenda y confirma si asistirás. Agendar no registra asistencia.',
        data: { source: 'intro_class_reminder', category: 'classes', class_date: classDate },
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(reminderAt) },
    });
    await AsyncStorage.setItem(key, id);
    return 'scheduled';
  } catch (cause) {
    devWarn('intro class: could not schedule local reminder', cause);
    return 'unsupported';
  }
}
