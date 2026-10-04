import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Redirect, router } from 'expo-router';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { KeyboardAwareScreen } from '../../components/ui/KeyboardAwareScreen';
import { SocialLinksRow } from '../../components/ui/SocialLinksRow';
import { ucapsaBrand } from '../../constants/brand';
import { resolveUcapsaFormat } from '../../constants/ucapsaFormats';
import { useSession } from '../../hooks/useSession';

const wordmark = require('../../../assets/images/brand/ucapsa-wordmark.png');

export default function ProfileScreen() {
  const { loading, user, profile, role, isAdmin } = useSession();
  const format = resolveUcapsaFormat({ user, role, isAdmin });
  const premium = Boolean(user) && format.key === 'member';

  if (loading) {
    return (
      <KeyboardAwareScreen style={[styles.screen, { backgroundColor: format.background }]}>
        <Text style={[styles.title, { color: format.text }]}>Perfil</Text>
        <Text style={[styles.muted, { color: format.muted }]}>Cargando sesión...</Text>
      </KeyboardAwareScreen>
    );
  }

  if (user && isAdmin) return <Redirect href="/admin-more" />;

  if (user) {
    const displayName = profile?.full_name?.trim() || user.email?.split('@')[0] || 'Tu cuenta';
    const initial = displayName.slice(0, 1).toLocaleUpperCase('es-MX');

    return (
      <KeyboardAwareScreen
        backgroundColor={format.background}
        style={{ backgroundColor: format.background }}
        contentContainerStyle={styles.clientContent}
      >
        <View style={[styles.profileHero, premium && styles.profileHeroPremium, { borderColor: format.cardBorder }]}>
          <View style={[styles.avatar, { backgroundColor: profile?.avatar_color || format.accent }]}>
            <Text style={styles.avatarText}>{initial}</Text>
          </View>
          <View style={styles.profileHeroCopy}>
            <Text style={[styles.eyebrow, { color: premium ? ucapsaBrand.colors.premiumAction : format.accentDark }]}>TU CUENTA UCAPSA</Text>
            <Text numberOfLines={1} style={[styles.clientTitle, { color: format.cardText }]}>{displayName}</Text>
            <Text style={[styles.clientSubtitle, { color: premium ? ucapsaBrand.colors.premiumMuted : format.muted }]}>
              Perfil, perros, pagos, notificaciones y accesos en un solo lugar.
            </Text>
          </View>
        </View>

        <Text style={[styles.sectionTitle, { color: premium ? ucapsaBrand.colors.premiumAction : format.accentDark }]}>Perfil y cuenta</Text>
        <HubRow
          icon="person"
          title="Mis datos"
          subtitle="Nombre, teléfono, correo y avatar."
          premium={premium}
          format={format}
          onPress={() => router.push('/account-settings?section=profile' as never)}
        />
        <HubRow
          icon="pets"
          title="Mis perros"
          subtitle="Perfil, entrenamiento, nivel, historial y logros de cada perro."
          premium={premium}
          format={format}
          onPress={() => router.push('/dog' as never)}
        />

        <Text style={[styles.sectionTitle, { color: premium ? ucapsaBrand.colors.premiumAction : format.accentDark }]}>Cuenta y servicios</Text>
        <HubRow
          icon="account-balance-wallet"
          title="Pagos"
          subtitle="Saldo, cargos y movimientos."
          premium={premium}
          format={format}
          onPress={() => router.push('/payments' as never)}
        />
        <HubRow
          icon="workspace-premium"
          title="Membresía"
          subtitle="Estado, credencial y acceso de socio."
          premium={premium}
          format={format}
          onPress={() => router.push('/client/membership' as never)}
        />
        <HubRow
          icon="notifications-none"
          title="Notificaciones"
          subtitle="Elige qué avisos oficiales quieres recibir."
          premium={premium}
          format={format}
          onPress={() => router.push('/account-settings?section=notifications' as never)}
        />
        <HubRow
          icon="grid-view"
          title="Servicios UCAPSA"
          subtitle="Restaurante, consultas y otros accesos."
          premium={premium}
          format={format}
          onPress={() => router.push('/services' as never)}
        />
        <HubRow
          icon="settings"
          title="Ajustes, privacidad y sesión"
          subtitle="Privacidad, términos, eliminar cuenta y cerrar sesión."
          premium={premium}
          format={format}
          onPress={() => router.push('/account-settings' as never)}
        />
      </KeyboardAwareScreen>
    );
  }

  return (
    <KeyboardAwareScreen style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        <Image source={wordmark} style={styles.wordmark} resizeMode="contain" />
        <Text style={styles.title}>Perfil</Text>
        <Text style={styles.muted}>Si ya entrenas con UCAPSA, entra para ver clases, asistencias, logros, perros y pagos.</Text>
      </View>

      <Pressable style={styles.primaryButton} onPress={() => router.push('/auth/login' as never)}>
        <Text style={styles.primaryButtonText}>Iniciar sesión</Text>
      </Pressable>

      <Pressable style={styles.secondaryButton} onPress={() => router.push('/auth/register' as never)}>
        <Text style={styles.secondaryButtonText}>Crear cuenta</Text>
      </Pressable>

      <Pressable style={styles.tertiaryButton} onPress={() => router.push('/services' as never)}>
        <Text style={styles.tertiaryButtonText}>Todavía no entreno con UCAPSA</Text>
      </Pressable>

      <SocialLinksRow premium={false} />
    </KeyboardAwareScreen>
  );
}

function HubRow({
  icon,
  title,
  subtitle,
  premium,
  format,
  onPress,
}: {
  icon: keyof typeof MaterialIcons.glyphMap;
  title: string;
  subtitle: string;
  premium: boolean;
  format: ReturnType<typeof resolveUcapsaFormat>;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
      style={({ pressed }) => [
        styles.hubRow,
        {
          backgroundColor: format.cardBackground,
          borderColor: format.cardBorder,
        },
        pressed && styles.pressed,
      ]}
    >
      <View style={[styles.hubIcon, { backgroundColor: premium ? ucapsaBrand.colors.premiumSurfaceAlt : format.accentSoft }]}>
        <MaterialIcons name={icon} size={22} color={premium ? ucapsaBrand.colors.premiumAction : format.accentDark} />
      </View>
      <View style={styles.hubCopy}>
        <Text style={[styles.hubTitle, { color: format.cardText }]}>{title}</Text>
        <Text style={[styles.hubSubtitle, { color: premium ? ucapsaBrand.colors.premiumMuted : format.muted }]}>{subtitle}</Text>
      </View>
      <MaterialIcons name="chevron-right" size={23} color={premium ? ucapsaBrand.colors.premiumAction : format.accentDark} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: ucapsaBrand.colors.background },
  content: { gap: 14, paddingTop: 24 },
  clientContent: { gap: 9, paddingBottom: 124 },
  hero: { alignItems: 'center', gap: 8, paddingVertical: 18 },
  wordmark: { width: 190, height: 70 },
  title: { color: ucapsaBrand.colors.text, fontSize: 28, fontWeight: '900' },
  muted: { color: ucapsaBrand.colors.muted, fontSize: 14, lineHeight: 20, textAlign: 'center' },
  profileHero: {
    minHeight: 118,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderWidth: 1,
    borderRadius: 24,
    padding: 16,
    marginBottom: 9,
    backgroundColor: ucapsaBrand.colors.surface,
  },
  profileHeroPremium: { backgroundColor: ucapsaBrand.colors.premiumSurface },
  avatar: { width: 58, height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: ucapsaBrand.colors.surface, fontSize: 24, fontWeight: '900' },
  profileHeroCopy: { flex: 1, minWidth: 0 },
  eyebrow: { fontSize: 10, lineHeight: 13, fontWeight: '900', letterSpacing: 0.9 },
  clientTitle: { marginTop: 2, fontSize: 24, lineHeight: 29, fontWeight: '900' },
  clientSubtitle: { marginTop: 3, fontSize: 12, lineHeight: 17, fontWeight: '700' },
  sectionTitle: { marginTop: 9, marginBottom: 2, fontSize: 11, lineHeight: 15, fontWeight: '900', letterSpacing: 0.8, textTransform: 'uppercase' },
  hubRow: { minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 20, borderWidth: 1, padding: 13 },
  hubIcon: { width: 44, height: 44, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  hubCopy: { flex: 1, minWidth: 0 },
  hubTitle: { fontSize: 15, lineHeight: 20, fontWeight: '900' },
  hubSubtitle: { marginTop: 2, fontSize: 11, lineHeight: 16, fontWeight: '700' },
  pressed: { opacity: 0.76, transform: [{ scale: 0.995 }] },
  primaryButton: {
    minHeight: 48,
    borderRadius: 14,
    backgroundColor: ucapsaBrand.colors.red,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  primaryButtonText: { color: ucapsaBrand.colors.surface, fontWeight: '900', fontSize: 15 },
  secondaryButton: {
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: ucapsaBrand.colors.border,
    backgroundColor: ucapsaBrand.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  secondaryButtonText: { color: ucapsaBrand.colors.redDark, fontWeight: '900', fontSize: 15 },
  tertiaryButton: { minHeight: 42, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },
  tertiaryButtonText: { color: ucapsaBrand.colors.muted, fontWeight: '800', fontSize: 14, textAlign: 'center' },
});
