import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ucapsaBrand, withAlpha } from '../../constants/brand';

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
    <View style={[styles.container, premium && styles.containerPremium]}>
      <MaterialIcons name="cloud-off" size={20} color={premium ? ucapsaBrand.colors.premiumAction : ucapsaBrand.colors.warning} />
      <View style={styles.textWrap}>
        <Text style={[styles.title, premium && styles.titlePremium]}>{label}</Text>
        <Text style={[styles.text, premium && styles.textPremium]}>
          {date ? `Ultima actualizacion: ${date}.` : 'Se mostrara la ultima informacion disponible.'}
        </Text>
      </View>
      {onRetry ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Reintentar sincronizacion" style={[styles.retry, premium && styles.retryPremium]} onPress={onRetry}>
          <MaterialIcons name="refresh" size={20} color={premium ? ucapsaBrand.colors.premiumAction : ucapsaBrand.colors.redDark} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: ucapsaBrand.colors.warningBorder,
    backgroundColor: ucapsaBrand.colors.warningSoft,
    padding: 12,
  },
  containerPremium: {
    borderColor: withAlpha(ucapsaBrand.colors.gold, 0.36),
    backgroundColor: ucapsaBrand.colors.premiumSurface,
  },
  textWrap: { flex: 1 },
  title: { color: ucapsaBrand.colors.goldDark, fontSize: 13, fontWeight: '900' },
  titlePremium: { color: ucapsaBrand.colors.premiumAction },
  text: { color: ucapsaBrand.colors.goldDark, fontSize: 11, lineHeight: 16, fontWeight: '700', marginTop: 2 },
  textPremium: { color: ucapsaBrand.colors.premiumMuted },
  retry: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: ucapsaBrand.colors.surface },
  retryPremium: { backgroundColor: withAlpha(ucapsaBrand.colors.surface, 0.08), borderWidth: 1, borderColor: withAlpha(ucapsaBrand.colors.gold, 0.24) },
});
