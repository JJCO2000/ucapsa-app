import AsyncStorage from '@react-native-async-storage/async-storage';
import { devWarn } from '../lib/client-diagnostics';
import { quickHelpSeenKey } from '../utils/quick-help.utils';

export async function hasSeenQuickHelp(userId: string): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(quickHelpSeenKey(userId))) === '1';
  } catch (cause) {
    devWarn('quick-help: preference could not be read', cause);
    return true; // No mostrar recordatorios insistentes si no se puede verificar.
  }
}

export async function markQuickHelpSeen(userId: string): Promise<void> {
  try {
    await AsyncStorage.setItem(quickHelpSeenKey(userId), '1');
  } catch (cause) {
    devWarn('quick-help: preference could not be saved', cause);
  }
}
