import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ucapsaBrand } from '../../constants/brand';
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
    description: 'Avisos oficiales, agenda y cambios importantes.',
    icon: 'bullhorn-outline',
  },
  {
    key: 'classes',
    label: 'Clases',
    description: 'Recordatorios de Puppy, Comandos y futuras cancelaciones.',
    icon: 'school-outline',
  },
  {
    key: 'membership',
    label: 'Membresia',
    description: 'Pagos, vigencia y seguimiento de tu estado UCAPSA.',
    icon: 'badge-account-outline',
  },
  {
    key: 'achievements',
    label: 'Logros',
    description: 'Medallas y reconocimientos desbloqueados.',
    icon: 'medal-outline',
  },
];

export function NotificationSettingsCard({ premium = false }: NotificationSettingsCardProps) {
  const {
    preferences,
    permissionStatus,
    expoPushToken,
    canUsePush,
    isExpoGo,
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
  const statusLabel = loading
    ? 'Cargando'
    : isExpoGo
      ? 'Expo Go'
      : !canUsePush
        ? 'No disponible'
        : enabled && hasToken
          ? 'Dispositivo registrado'
          : enabled
            ? 'Activo, falta token'
            : 'Desactivadas';
  const actionLabel = registering ? 'Activando...' : enabled ? 'Desactivar notificaciones' : 'Activar notificaciones';
  const actionDisabled = busy || (!enabled && !canUsePush);

  return (
    <View style={[styles.card, premium && styles.cardPremium]}>
      <View style={styles.headerRow}>
        <View style={[styles.mainIcon, premium && styles.mainIconPremium]}>
          <MaterialCommunityIcons name="bell-ring-outline" size={22} color={premium ? '#FFE8B5' : ucapsaBrand.colors.red} />
        </View>
        <View style={styles.headerTextWrap}>
          <Text style={[styles.eyebrow, premium && styles.eyebrowPremium]}>Notificaciones UCAPSA</Text>
          <Text style={[styles.title, premium && styles.titlePremium]}>Avisos importantes en tu celular</Text>
        </View>
        <View style={[styles.statusPill, enabled && styles.statusPillEnabled, premium && styles.statusPillPremium]}>
          <Text style={[styles.statusText, enabled && styles.statusTextEnabled, premium && styles.statusTextPremium]}>{statusLabel}</Text>
        </View>
      </View>

      <Text style={[styles.description, premium && styles.descriptionPremium]}>
        Activalas solo si quieres recibir avisos oficiales de clases, eventos, membresia y logros. La app no enviara mensajes todavia; esto deja listo el registro del dispositivo para la siguiente fase.
      </Text>

      {!canUsePush ? (
        <View style={[styles.warningBox, premium && styles.warningBoxPremium]}>
          <MaterialCommunityIcons name="information-outline" size={18} color={premium ? '#FFE8B5' : ucapsaBrand.colors.warning} />
          <Text style={[styles.warningText, premium && styles.warningTextPremium]}>
            {isExpoGo ? 'Para probar push reales usa development build o APK de EAS, no Expo Go.' : 'Las push reales necesitan un dispositivo compatible.'}
          </Text>
        </View>
      ) : null}

      {permissionStatus === 'denied' ? (
        <View style={[styles.warningBox, premium && styles.warningBoxPremium]}>
          <MaterialCommunityIcons name="bell-off-outline" size={18} color={premium ? '#FFE8B5' : ucapsaBrand.colors.danger} />
          <Text style={[styles.warningText, premium && styles.warningTextPremium]}>El permiso del sistema esta bloqueado. Activalo desde ajustes del celular.</Text>
        </View>
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
        onPress={() => void setNotificationsEnabled(!enabled)}
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
                <MaterialCommunityIcons name={item.icon} size={19} color={premium ? '#FFE8B5' : ucapsaBrand.colors.red} />
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
                <Text style={[styles.toggleText, itemEnabled && styles.toggleTextEnabled, premium && styles.toggleTextPremium]}>{itemEnabled ? 'Si' : 'No'}</Text>
              </Pressable>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 14,
    padding: 16,
    borderRadius: 26,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: ucapsaBrand.colors.border,
  },
  cardPremium: {
    backgroundColor: '#38111B',
    borderColor: 'rgba(250,204,21,0.34)',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  mainIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ucapsaBrand.colors.redSoft,
  },
  mainIconPremium: {
    backgroundColor: 'rgba(250,204,21,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(250,204,21,0.25)',
  },
  headerTextWrap: {
    flex: 1,
  },
  eyebrow: {
    color: ucapsaBrand.colors.red,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  eyebrowPremium: {
    color: '#FFE8B5',
  },
  title: {
    color: ucapsaBrand.colors.text,
    fontSize: 16,
    fontWeight: '900',
  },
  titlePremium: {
    color: '#FFFFFF',
  },
  statusPill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
    backgroundColor: '#F1F5F9',
  },
  statusPillEnabled: {
    backgroundColor: '#DCFCE7',
  },
  statusPillPremium: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(250,204,21,0.22)',
  },
  statusText: {
    color: '#64748B',
    fontSize: 11,
    fontWeight: '900',
  },
  statusTextEnabled: {
    color: '#166534',
  },
  statusTextPremium: {
    color: '#FFE8B5',
  },
  description: {
    color: ucapsaBrand.colors.muted,
    fontSize: 14,
    lineHeight: 21,
  },
  descriptionPremium: {
    color: '#FFE3E8',
  },
  warningBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 12,
    borderRadius: 18,
    backgroundColor: '#FFF7ED',
    borderWidth: 1,
    borderColor: '#FED7AA',
  },
  warningBoxPremium: {
    backgroundColor: 'rgba(250,204,21,0.10)',
    borderColor: 'rgba(250,204,21,0.24)',
  },
  warningText: {
    flex: 1,
    color: '#9A3412',
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '700',
  },
  warningTextPremium: {
    color: '#FFE8B5',
  },
  errorText: {
    color: ucapsaBrand.colors.danger,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '800',
  },
  errorTextPremium: {
    color: '#FFD1D8',
  },
  primaryButton: {
    minHeight: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    backgroundColor: ucapsaBrand.colors.red,
  },
  primaryButtonPremium: {
    backgroundColor: '#FACC15',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '900',
  },
  primaryButtonTextPremium: {
    color: '#4A0710',
  },
  categoriesWrap: {
    gap: 10,
  },
  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 20,
    backgroundColor: '#FFF8F8',
    borderWidth: 1,
    borderColor: ucapsaBrand.colors.border,
  },
  categoryRowPremium: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderColor: 'rgba(250,204,21,0.18)',
  },
  categoryRowDisabled: {
    opacity: 0.58,
  },
  categoryIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  categoryIconPremium: {
    backgroundColor: 'rgba(250,204,21,0.10)',
  },
  categoryTextWrap: {
    flex: 1,
  },
  categoryTitle: {
    color: ucapsaBrand.colors.text,
    fontSize: 14,
    fontWeight: '900',
  },
  categoryTitlePremium: {
    color: '#FFFFFF',
  },
  categoryDescription: {
    color: ucapsaBrand.colors.muted,
    fontSize: 12,
    lineHeight: 17,
  },
  categoryDescriptionPremium: {
    color: '#FFE3E8',
  },
  toggle: {
    minWidth: 52,
    borderRadius: 999,
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#E2E8F0',
  },
  toggleEnabled: {
    backgroundColor: '#DCFCE7',
  },
  togglePremium: {
    backgroundColor: 'rgba(255,255,255,0.10)',
  },
  toggleDisabled: {
    opacity: 0.55,
  },
  toggleText: {
    color: '#475569',
    fontSize: 12,
    fontWeight: '900',
  },
  toggleTextEnabled: {
    color: '#166534',
  },
  toggleTextPremium: {
    color: '#FFE8B5',
  },
  disabled: {
    opacity: 0.55,
  },
  pressed: {
    opacity: 0.86,
    transform: [{ scale: 0.995 }],
  },
});
