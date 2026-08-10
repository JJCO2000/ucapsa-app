import AsyncStorage from '@react-native-async-storage/async-storage';

import { supabase } from '../lib/supabase';
import type { NotificationPreferences, NotificationToken } from '../types/app.types';

const STORED_EXPO_PUSH_TOKEN_KEY = 'ucapsa:expoPushToken';

export const DEFAULT_NOTIFICATION_PREFERENCES = {
  enabled: false,
  announcements_events: true,
  classes: true,
  membership: true,
  achievements: true,
} as const;

type PreferenceUpdateInput = Partial<Pick<NotificationPreferences, 'enabled' | 'announcements_events' | 'classes' | 'membership' | 'achievements'>>;

type RegisterExpoPushTokenInput = {
  expoPushToken: string;
  platform: string;
  deviceName?: string | null;
  deviceId?: string | null;
  appOwnership?: string | null;
  appVersion?: string | null;
  projectId?: string | null;
};

function normalizePreference(row: unknown, userId: string): NotificationPreferences {
  const value = (row ?? {}) as Partial<NotificationPreferences>;
  return {
    user_id: value.user_id ?? userId,
    enabled: value.enabled ?? DEFAULT_NOTIFICATION_PREFERENCES.enabled,
    announcements_events: value.announcements_events ?? DEFAULT_NOTIFICATION_PREFERENCES.announcements_events,
    classes: value.classes ?? DEFAULT_NOTIFICATION_PREFERENCES.classes,
    membership: value.membership ?? DEFAULT_NOTIFICATION_PREFERENCES.membership,
    achievements: value.achievements ?? DEFAULT_NOTIFICATION_PREFERENCES.achievements,
    created_at: value.created_at ?? new Date().toISOString(),
    updated_at: value.updated_at ?? new Date().toISOString(),
  };
}

function normalizeToken(row: unknown): NotificationToken {
  return row as NotificationToken;
}

async function getCurrentUserId() {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  const userId = data.user?.id;
  if (!userId) throw new Error('No hay sesion activa.');
  return userId;
}

export async function getNotificationPreferences(): Promise<NotificationPreferences> {
  const userId = await getCurrentUserId();

  const { data, error } = await supabase
    .from('notification_preferences')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;
  return normalizePreference(data, userId);
}

export async function updateNotificationPreferences(input: PreferenceUpdateInput): Promise<NotificationPreferences> {
  const userId = await getCurrentUserId();
  const current = await getNotificationPreferences();
  const payload = {
    user_id: userId,
    enabled: input.enabled ?? current.enabled,
    announcements_events: input.announcements_events ?? current.announcements_events,
    classes: input.classes ?? current.classes,
    membership: input.membership ?? current.membership,
    achievements: input.achievements ?? current.achievements,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('notification_preferences')
    .upsert(payload, { onConflict: 'user_id' })
    .select('*')
    .single();

  if (error) throw error;
  return normalizePreference(data, userId);
}

export async function registerExpoPushToken(input: RegisterExpoPushTokenInput): Promise<NotificationToken> {
  const { data, error } = await supabase.rpc('upsert_notification_token', {
    p_expo_push_token: input.expoPushToken,
    p_platform: input.platform,
    p_device_name: input.deviceName ?? undefined,
    p_device_id: input.deviceId ?? undefined,
    p_app_ownership: input.appOwnership ?? undefined,
    p_app_version: input.appVersion ?? undefined,
    p_project_id: input.projectId ?? undefined,
  });

  if (error) throw error;

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error('No se pudo registrar el dispositivo.');

  await AsyncStorage.setItem(STORED_EXPO_PUSH_TOKEN_KEY, input.expoPushToken);
  return normalizeToken(row);
}

export async function getStoredExpoPushToken() {
  return AsyncStorage.getItem(STORED_EXPO_PUSH_TOKEN_KEY);
}

export async function disableStoredExpoPushToken(): Promise<void> {
  const token = await getStoredExpoPushToken();
  if (!token) return;

  const { error } = await supabase.rpc('disable_notification_token', {
    p_expo_push_token: token,
  });

  if (error) throw error;
  await AsyncStorage.removeItem(STORED_EXPO_PUSH_TOKEN_KEY);
}
