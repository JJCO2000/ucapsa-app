import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Pressable, StyleSheet, Text } from 'react-native';

import { ucapsaBrand } from '../../constants/brand';

/**
 * A saved-data fallback is not necessarily a lost connection.
 * Keep the caller's context visible instead of displaying an unexplained icon.
 */
export function OfflineDataNotice({
  onRetry,
  premium = false,
  label = 'Mostrando información guardada',
}: {
  savedAt?: string | null;
  onRetry?: () => void;
  premium?: boolean;
  label?: string;
}) {
  const displayLabel = label.trim() || 'Mostrando información guardada';
  return (
    <Pressable
      accessibilityRole={onRetry ? 'button' : undefined}
      accessibilityLabel={onRetry ? displayLabel + '. Actualizar información' : displayLabel}
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
      <Text style={[styles.message, premium && styles.messagePremium]}>{displayLabel}</Text>
      {onRetry ? (
        <Text style={[styles.action, premium && styles.actionPremium]}>Actualizar</Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    alignSelf: 'flex-start',
    maxWidth: '100%',
    minHeight: 48,
    paddingHorizontal: 12,
    paddingVertical: 9,
    flexDirection: 'row',
    gap: 8,
    borderRadius: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: ucapsaBrand.colors.warningBorder,
    backgroundColor: ucapsaBrand.colors.warningSoft,
  },
  containerPremium: {
    borderColor: ucapsaBrand.colors.premiumBorder,
    backgroundColor: ucapsaBrand.colors.premiumSurface,
  },
  message: {
    flexShrink: 1,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '700',
    color: ucapsaBrand.colors.text,
  },
  messagePremium: { color: ucapsaBrand.colors.premiumText },
  action: {
    fontSize: 12,
    fontWeight: '900',
    color: ucapsaBrand.colors.redDark,
  },
  actionPremium: { color: ucapsaBrand.colors.premiumAction },
  pressed: { opacity: 0.72 },
});
