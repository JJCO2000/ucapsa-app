import { Alert, Platform, type AlertButton } from 'react-native';

/**
 * Use the platform's existing confirmation UI. React Native Alert.alert does
 * not show a usable confirmation on web; the browser confirmation is already
 * the pattern used by UCAPSA's Admin preregistration screens.
 *
 * Never execute a destructive action without an affirmative user decision.
 */
export function showPlatformDialog(title: string, message: string, buttons?: AlertButton[]) {
  if (Platform.OS === 'web') {
    if (!buttons?.length) {
      window.alert(title + '\n\n' + message);
      return;
    }
    const affirmative = buttons.find((button) => button.style !== 'cancel' && button.onPress);
    if (affirmative && window.confirm(title + '\n\n' + message)) {
      affirmative.onPress?.();
    }
    return;
  }
  Alert.alert(title, message, buttons);
}

// Backward-compatible alias: Admin/Trainer screens retain the canonical dialog.
export const showStaffDialog = showPlatformDialog;
