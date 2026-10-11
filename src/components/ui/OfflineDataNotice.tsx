import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Pressable, StyleSheet } from 'react-native';

import { ucapsaBrand } from '../../constants/brand';

export function OfflineDataNotice({
  onRetry,
  premium = false,
}: {
  savedAt?: string | null;
  onRetry?: () => void;
  premium?: boolean;
  label?: string;
}) {
  return (
    <Pressable
      accessibilityRole={onRetry ? 'button' : undefined}
      accessibilityLabel={onRetry ? 'Sin conexión. Reintentar sincronización.' : 'Sin conexión.'}
      disabled={!onRetry}
      hitSlop={6}
      style={({ pressed }) => [
        styles.container,
        premium && styles.containerPremium,
        pressed && onRetry && styles.pressed,
      ]}
      onPress={onRetry}
    >
      <MaterialIcons
        name="cloud-off"
        size={22}
        color={premium ? ucapsaBrand.colors.premiumAction : ucapsaBrand.colors.warningDark}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    alignSelf: 'flex-start',
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: ucapsaBrand.colors.warningBorder,
    backgroundColor: ucapsaBrand.colors.warningSoft,
  },
  containerPremium: {
    borderColor: ucapsaBrand.colors.premiumBorder,
    backgroundColor: ucapsaBrand.colors.premiumSurface,
  },
  pressed: { opacity: 0.72 },
});
