import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { ucapsaBrand, withAlpha } from '../../constants/brand';
import { useNotifications } from '../../hooks/useNotifications';
import type { NotificationCategoryKey } from '../../types/app.types';

type NotificationSettingsCardProps = {
  premium?: boolean;
};

type CategoryItem = {
  key: NotificationCategoryKey;
  label: string;
  description: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
};

const categories: CategoryItem[] = [
  {
    key: 'announcements_events',
    label: 'Anuncios y eventos',
    description: 'Novedades y cambios importantes.',
    icon: 'bullhorn-outline',
  },
  {
    key: 'classes',
    label: 'Clases',
    description: 'Recordatorios y cancelaciones de clases.',
    icon: 'school-outline',
  },
  {
    key: 'membership',
    label: 'Membresía',
    description: 'Pagos, vigencia y cambios de tu membresía.',
    icon: 'badge-account-outline',
  },
  {
    key: 'achievements',
    label: 'Logros',
    description: 'Medallas y reconocimientos que consigas.',
    icon: 'medal-outline',
  },
];

export function NotificationSettingsCard({ premium = false }: NotificationSettingsCardProps) {
  const {
    preferences,
    permissionStatus,
    expoPushToken,
    canUsePush,
    loading,
    saving,
    registering,
    errorMessage,
    setNotificationsEnabled,
    setCategoryEnabled,
  } = useNotifications();

  const enabled = Boolean(preferences?.enabled);
  const busy = loading || saving || registering;
  const hasToken = Boolean(expoPushToken);
  const permissionBlocked = permissionStatus === 'denied';
  const statusLabel = loading
    ? 'Cargando'
    : permissionBlocked
      ? 'Bloqueadas'
      : enabled && hasToken
        ? 'Activadas'
        : enabled
          ? 'Activando'
          : !canUsePush
            ? 'No disponibles'
            : 'Desactivadas';
  const actionLabel = permissionBlocked
    ? 'Abrir ajustes'
    : registering
      ? 'Activando...'
      : enabled
        ? 'Desactivar notificaciones'
        : 'Activar notificaciones';
  const actionDisabled = busy || (!permissionBlocked && !enabled && !canUsePush);

  async function handlePrimaryAction() {
    if (permissionBlocked) {
      await Linking.openSettings();
      return;
    }
    await setNotificationsEnabled(!enabled);
  }

  return (
    <View style={[styles.card, premium && styles.cardPremium]}>
      <View style={styles.headerRow}>
        <View style={[styles.mainIcon, premium && styles.mainIconPremium]}>
          <MaterialCommunityIcons name="bell-ring-outline" size={22} color={premium ? ucapsaBrand.colors.premiumAction : ucapsaBrand.colors.red} />
        </View>
        <View style={styles.headerTextWrap}>
          <Text style={[styles.title, premium && styles.titlePremium]}>Recordatorios</Text>
          <Text style={[styles.description, premium && styles.descriptionPremium]}>Recibe recordatorios de clases y novedades importantes de UCAPSA.</Text>
        </View>
      </View>

      <View style={[styles.statusRow, premium && styles.statusRowPremium]}>
        <Text style={[styles.statusLabel, premium && styles.statusLabelPremium]}>Estado</Text>
        <View style={[styles.statusPill, enabled && hasToken && styles.statusPillEnabled, premium && styles.statusPillPremium]}>
          <Text style={[styles.statusText, enabled && hasToken && styles.statusTextEnabled, premium && styles.statusTextPremium]}>{statusLabel}</Text>
        </View>
      </View>

      {permissionBlocked ? (
        <View style={[styles.warningBox, premium && styles.warningBoxPremium]}>
          <MaterialCommunityIcons name="bell-off-outline" size={18} color={premium ? ucapsaBrand.colors.premiumAction : ucapsaBrand.colors.danger} />
          <Text style={[styles.warningText, premium && styles.warningTextPremium]}>Las notificaciones están desactivadas en los ajustes de tu celular.</Text>
        </View>
      ) : !canUsePush ? (
        <Text style={[styles.helperText, premium && styles.descriptionPremium]}>Las notificaciones se activan desde la versión instalada de UCAPSA.</Text>
      ) : null}

      {errorMessage ? <Text style={[styles.errorText, premium && styles.errorTextPremium]}>{errorMessage}</Text> : null}

      <Pressable
        disabled={actionDisabled}
        style={({ pressed }) => [
          styles.primaryButton,
          premium && styles.primaryButtonPremium,
          actionDisabled && styles.disabled,
          pressed && !actionDisabled && styles.pressed,
        ]}
        onPress={() => void handlePrimaryAction()}
      >
        <Text style={[styles.primaryButtonText, premium && styles.primaryButtonTextPremium]}>{actionLabel}</Text>
      </Pressable>

      <View style={styles.categoriesWrap}>
        {categories.map((item) => {
          const itemEnabled = Boolean(preferences?.[item.key]);
          const rowDisabled = !enabled || busy;
          return (
            <View key={item.key} style={[styles.categoryRow, premium && styles.categoryRowPremium, !enabled && styles.categoryRowDisabled]}>
              <View style={[styles.categoryIcon, premium && styles.categoryIconPremium]}>
                <MaterialCommunityIcons name={item.icon} size={19} color={premium ? ucapsaBrand.colors.premiumAction : ucapsaBrand.colors.red} />
              </View>
              <View style={styles.categoryTextWrap}>
                <Text style={[styles.categoryTitle, premium && styles.categoryTitlePremium]}>{item.label}</Text>
                <Text style={[styles.categoryDescription, premium && styles.categoryDescriptionPremium]}>{item.description}</Text>
              </View>
              <Pressable
                disabled={rowDisabled}
                style={[styles.toggle, itemEnabled && styles.toggleEnabled, premium && styles.togglePremium, rowDisabled && styles.toggleDisabled]}
                onPress={() => void setCategoryEnabled(item.key, !itemEnabled)}
              >
                <Text style={[styles.toggleText, itemEnabled && styles.toggleTextEnabled, premium && styles.toggleTextPremium]}>{itemEnabled ? 'Sí' : 'No'}</Text>
              </Pressable>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: 14, padding: 16, borderRadius: 26, backgroundColor: ucapsaBrand.colors.surface, borderWidth: 1, borderColor: ucapsaBrand.colors.border },
  cardPremium: { backgroundColor: ucapsaBrand.colors.premiumSurface, borderColor: withAlpha(ucapsaBrand.colors.gold, 0.34) },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  mainIcon: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: ucapsaBrand.colors.redSoft },
  mainIconPremium: { backgroundColor: withAlpha(ucapsaBrand.colors.gold, 0.14), borderWidth: 1, borderColor: withAlpha(ucapsaBrand.colors.gold, 0.26) },
  headerTextWrap: { flex: 1, minWidth: 0 },
  title: { color: ucapsaBrand.colors.text, fontSize: 20, lineHeight: 25, fontWeight: '900' },
  titlePremium: { color: ucapsaBrand.colors.surface },
  description: { color: ucapsaBrand.colors.muted, fontSize: 14, lineHeight: 20, fontWeight: '700', marginTop: 3 },
  descriptionPremium: { color: ucapsaBrand.colors.premiumMuted },
  statusRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, borderTopWidth: 1, borderTopColor: ucapsaBrand.colors.border, paddingTop: 12 },
  statusRowPremium: { borderTopColor: withAlpha(ucapsaBrand.colors.gold, 0.18) },
  statusLabel: { color: ucapsaBrand.colors.muted, fontSize: 12, fontWeight: '900', textTransform: 'uppercase' },
  statusLabelPremium: { color: ucapsaBrand.colors.premiumMuted },
  statusPill: { flexShrink: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7, backgroundColor: ucapsaBrand.colors.surfaceAlt },
  statusPillEnabled: { backgroundColor: ucapsaBrand.colors.successSoft },
  statusPillPremium: { backgroundColor: withAlpha(ucapsaBrand.colors.gold, 0.13), borderWidth: 1, borderColor: withAlpha(ucapsaBrand.colors.gold, 0.25) },
  statusText: { color: ucapsaBrand.colors.muted, fontSize: 12, fontWeight: '900' },
  statusTextEnabled: { color: ucapsaBrand.colors.successDark },
  statusTextPremium: { color: ucapsaBrand.colors.premiumAction },
  warningBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, borderRadius: 16, borderWidth: 1, borderColor: ucapsaBrand.colors.warningBorder, backgroundColor: ucapsaBrand.colors.warningSoft, padding: 12 },
  warningBoxPremium: { borderColor: withAlpha(ucapsaBrand.colors.gold, 0.3), backgroundColor: withAlpha(ucapsaBrand.colors.gold, 0.1) },
  warningText: { flex: 1, color: ucapsaBrand.colors.text, fontSize: 13, lineHeight: 18, fontWeight: '800' },
  warningTextPremium: { color: ucapsaBrand.colors.surface },
  helperText: { fontSize: 12, lineHeight: 18, fontWeight: '700' },
  errorText: { color: ucapsaBrand.colors.danger, fontSize: 13, lineHeight: 18, fontWeight: '800' },
  errorTextPremium: { color: ucapsaBrand.colors.premiumAction },
  primaryButton: { minHeight: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, backgroundColor: ucapsaBrand.colors.red },
  primaryButtonPremium: { backgroundColor: ucapsaBrand.colors.premiumAction },
  primaryButtonText: { color: ucapsaBrand.colors.surface, fontSize: 15, fontWeight: '900' },
  primaryButtonTextPremium: { color: ucapsaBrand.colors.premiumActionText },
  categoriesWrap: { gap: 10 },
  categoryRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 18, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surfaceSubtle, padding: 11 },
  categoryRowPremium: { borderColor: withAlpha(ucapsaBrand.colors.gold, 0.22), backgroundColor: withAlpha(ucapsaBrand.colors.surface, 0.05) },
  categoryRowDisabled: { opacity: 0.62 },
  categoryIcon: { width: 36, height: 36, borderRadius: 13, backgroundColor: ucapsaBrand.colors.redSoft, alignItems: 'center', justifyContent: 'center' },
  categoryIconPremium: { backgroundColor: withAlpha(ucapsaBrand.colors.gold, 0.13) },
  categoryTextWrap: { flex: 1, minWidth: 0 },
  categoryTitle: { color: ucapsaBrand.colors.text, fontSize: 14, fontWeight: '900' },
  categoryTitlePremium: { color: ucapsaBrand.colors.surface },
  categoryDescription: { color: ucapsaBrand.colors.muted, fontSize: 11, lineHeight: 16, marginTop: 2, fontWeight: '700' },
  categoryDescriptionPremium: { color: ucapsaBrand.colors.premiumMuted },
  toggle: { minWidth: 48, borderRadius: 999, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10, paddingVertical: 8, backgroundColor: ucapsaBrand.colors.surfaceAlt, borderWidth: 1, borderColor: ucapsaBrand.colors.border },
  toggleEnabled: { backgroundColor: ucapsaBrand.colors.redSoft, borderColor: ucapsaBrand.colors.redBorder },
  togglePremium: { borderColor: withAlpha(ucapsaBrand.colors.gold, 0.25), backgroundColor: withAlpha(ucapsaBrand.colors.surface, 0.06) },
  toggleDisabled: { opacity: 0.75 },
  toggleText: { color: ucapsaBrand.colors.muted, fontSize: 12, fontWeight: '900' },
  toggleTextEnabled: { color: ucapsaBrand.colors.redDark },
  toggleTextPremium: { color: ucapsaBrand.colors.premiumAction },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.82 },
});
