import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Pressable, StyleSheet, Text } from 'react-native';

import { ucapsaBrand } from '../../constants/brand';

export function OfflineDataNotice({
  onRetry,
  premium = false,
  label,
}: {
  savedAt?: string | null;
  onRetry?: () => void;
  premium?: boolean;
  label?: string;
}) {
  // A saved result does not necessarily mean the phone is offline:
  // the server may have failed while the local copy remains readable.
  const message = label?.trim() || 'Datos guardados';

  return (
    <Pressable
      accessibilityRole={onRetry ? 'button' : 'text'}
      accessibilityLabel={onRetry ? message + '. Actualizar datos.' : message}
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
        size={20}
        color={premium ? ucapsaBrand.colors.premiumAction : ucapsaBrand.colors.warningDark}
      />
      <Text numberOfLines={2} style={[styles.message, premium && styles.messagePremium]}>
        {message}
      </Text>
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
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: ucapsaBrand.colors.warningBorder,
    backgroundColor: ucapsaBrand.colors.warningSoft,
  },
  message: {
    flexShrink: 1,
    color: ucapsaBrand.colors.warningDark,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '700',
  },
  messagePremium: { color: ucapsaBrand.colors.premiumMuted },
  action: {
    color: ucapsaBrand.colors.warningDark,
    fontSize: 12,
    fontWeight: '900',
  },
  actionPremium: { color: ucapsaBrand.colors.premiumAction },
  containerPremium: {
    borderColor: ucapsaBrand.colors.premiumBorder,
    backgroundColor: ucapsaBrand.colors.premiumSurface,
  },
  pressed: { opacity: 0.72 },
});
