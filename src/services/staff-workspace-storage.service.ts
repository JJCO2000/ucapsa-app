import AsyncStorage from '@react-native-async-storage/async-storage';

export type PersistedStaffWorkspaceMode = 'admin' | 'trainer';

const STORAGE_PREFIX = 'ucapsa:staff-workspace:v1:';

function storageKey(userId: string) {
  return `${STORAGE_PREFIX}${userId}`;
}

export async function readStaffWorkspaceMode(userId: string): Promise<PersistedStaffWorkspaceMode> {
  const value = await AsyncStorage.getItem(storageKey(userId));
  return value === 'trainer' ? 'trainer' : 'admin';
}

export async function writeStaffWorkspaceMode(
  userId: string,
  mode: PersistedStaffWorkspaceMode,
): Promise<void> {
  await AsyncStorage.setItem(storageKey(userId), mode);
}
