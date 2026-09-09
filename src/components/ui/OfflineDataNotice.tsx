import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ucapsaBrand } from '../../constants/brand';

function formatSavedAt(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString('es-MX', {
    day: '2-digit',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function OfflineDataNotice({
  savedAt,
  onRetry,
  premium = false,
  label = 'Mostrando datos guardados',
}: {
  savedAt?: string | null;
  onRetry?: () => void;
  premium?: boolean;
  label?: string;
}) {
  const date = formatSavedAt(savedAt);
  return (
    <View style={[styles.container, premium && styles.containerPremium]} accessibilityRole="summary">
      <MaterialIcons name="cloud-off" size={22} color={premium ? ucapsaBrand.colors.premiumAction : ucapsaBrand.colors.warningDark} />
      <View style={styles.textWrap}>
        <Text style={[styles.title, premium && styles.titlePremium]}>{label}</Text>
        <Text style={[styles.text, premium && styles.textPremium]}>
          {date ? `Última actualización: ${date}.` : 'Se mostrará la última información disponible.'}
        </Text>
      </View>
      {onRetry ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Reintentar sincronización"
          hitSlop={4}
          style={({ pressed }) => [styles.retry, premium && styles.retryPremium, pressed && styles.pressed]}
          onPress={onRetry}
        >
          <MaterialIcons name="refresh" size={22} color={premium ? ucapsaBrand.colors.premiumActionText : ucapsaBrand.colors.redDark} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: ucapsaBrand.colors.warningBorder,
    backgroundColor: ucapsaBrand.colors.warningSoft,
    padding: 12,
  },
  containerPremium: {
    borderColor: ucapsaBrand.colors.premiumBorder,
    backgroundColor: ucapsaBrand.colors.premiumSurface,
  },
  textWrap: { flex: 1, minWidth: 0 },
  title: { color: ucapsaBrand.colors.goldDark, fontSize: 14, lineHeight: 18, fontWeight: '900' },
  titlePremium: { color: ucapsaBrand.colors.premiumActionText },
  text: { color: ucapsaBrand.colors.goldDark, fontSize: 12, lineHeight: 17, fontWeight: '700', marginTop: 2 },
  textPremium: { color: ucapsaBrand.colors.premiumMuted },
  retry: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ucapsaBrand.colors.surface,
    borderWidth: 1,
    borderColor: ucapsaBrand.colors.warningBorder,
  },
  retryPremium: {
    backgroundColor: ucapsaBrand.colors.premiumHero,
    borderColor: ucapsaBrand.colors.premiumBorder,
  },
  pressed: { opacity: 0.72 },
});
