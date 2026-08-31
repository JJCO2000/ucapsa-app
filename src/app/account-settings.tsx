import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';

import { NotificationSettingsCard } from '../components/domain/NotificationSettingsCard';
import { KeyboardAwareModal } from '../components/ui/KeyboardAwareModal';
import { KeyboardAwareScreen } from '../components/ui/KeyboardAwareScreen';
import { OfflineDataNotice } from '../components/ui/OfflineDataNotice';
import { resolveUcapsaFormat } from '../constants/ucapsaFormats';
import { ucapsaBrand, withAlpha } from '../constants/brand';
import { useSession } from '../hooks/useSession';
import { requestAccountDeletion, requestMyEmailChange, updateMyProfile } from '../services/profiles.service';
import { DEFAULT_WRITE_TIMEOUT_MS, friendlyWriteError, withOperationTimeout } from '../utils/async.utils';

type SettingsSection = 'notifications' | 'profile' | 'delete';

const avatarColors: string[] = [ucapsaBrand.colors.red, ucapsaBrand.colors.redDark, ucapsaBrand.colors.blue, ucapsaBrand.colors.purple, ucapsaBrand.colors.green];

export default function AccountSettingsScreen() {
  const { loading, user, profile, role, isAdmin, signOut, refreshProfile, acceptProfile, isOfflineFallback, lastProfileSyncAt } = useSession();
  const params = useLocalSearchParams<{ section?: string }>();
  const section = normalizeSection(params.section, isAdmin);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [avatarColor, setAvatarColor] = useState<string>(ucapsaBrand.colors.red);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [editing, setEditing] = useState(false);

  const format = useMemo(() => resolveUcapsaFormat({ user, role, isAdmin }), [user, role, isAdmin]);
  const premium = Boolean(user) && format.key === 'member' && !isAdmin;
  const deletionRequested = Boolean(profile?.deletion_requested_at);
  const profileComplete = Boolean((profile?.full_name ?? '').trim() && (profile?.phone ?? '').trim());

  useEffect(() => {
    setFullName(profile?.full_name ?? '');
    setEmail(profile?.email ?? user?.email ?? '');
    setPhone(profile?.phone ?? '');
    setAvatarColor(profile?.avatar_color ?? ucapsaBrand.colors.red);
  }, [profile, user?.email]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refreshProfile();
    } catch {
      // El perfil local sigue siendo util sin conexion; el aviso de datos guardados
      // lo comunica sin convertir el gesto de actualizar en un error no manejado.
    } finally {
      setRefreshing(false);
    }
  }, [refreshProfile]);

  async function handleSaveProfile() {
    if (!user) {
      Alert.alert('Sesión no disponible', 'Vuelve a iniciar sesión antes de guardar cambios en tu cuenta.');
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      Alert.alert('Correo inválido', 'Escribe un correo válido antes de guardar.');
      return;
    }

    setSaving(true);
    try {
      const emailChanged = normalizedEmail !== (user.email ?? '').trim().toLowerCase();
      const emailChange = emailChanged ? await requestMyEmailChange(normalizedEmail) : null;

      const savedProfile = await withOperationTimeout(
        updateMyProfile({
          full_name: fullName,
          phone,
          avatar_color: avatarColor,
        }),
        DEFAULT_WRITE_TIMEOUT_MS,
        'profile-save',
      );
      await acceptProfile(savedProfile);
      setEditing(false);

      if (emailChange?.confirmationRequired) {
        Alert.alert('Confirma tu nuevo correo', `Enviamos la confirmación a ${emailChange.requestedEmail}. El cambio se reflejará al confirmarlo.`);
      } else {
        Alert.alert('Datos guardados', 'Tu información se actualizó correctamente.');
      }
    } catch (error) {
      Alert.alert('No se pudo guardar', friendlyWriteError(error));
    } finally {
      setSaving(false);
    }
  }

  function handleDeleteRequest() {
    if (deletionRequested) return;
    Alert.alert(
      'Solicitar eliminacion de cuenta',
      'Esto no borra la cuenta automaticamente. Administracion revisara membresía, pagos y datos relacionados.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Solicitar',
          style: 'destructive',
          onPress: async () => {
            try {
              await withOperationTimeout(
                requestAccountDeletion('Solicitud desde Ajustes de cuenta.'),
                DEFAULT_WRITE_TIMEOUT_MS,
                'account-delete-request',
              );
              try {
                await refreshProfile();
              } catch {
                // La solicitud ya fue confirmada por el servidor; no la conviertas en un falso fallo.
              }
              Alert.alert('Solicitud enviada', 'Administracion revisara la eliminacion de tu cuenta.');
            } catch (error) {
              Alert.alert('No se pudo solicitar', friendlyWriteError(error));
            }
          },
        },
      ],
    );
  }

  async function handleSignOut() {
    await signOut();
    router.replace('/auth/login' as never);
  }

  function openSection(next: SettingsSection) {
    router.push(`/account-settings?section=${next}` as never);
  }

  function back() {
    if (section) router.replace('/account-settings' as never);
    else router.back();
  }

  if (loading) {
    return <KeyboardAwareScreen><Text style={styles.title}>Ajustes</Text><Text style={styles.muted}>Cargando cuenta...</Text></KeyboardAwareScreen>;
  }

  if (!user) {
    return (
      <KeyboardAwareScreen>
        <Header title="Ajustes" subtitle="Inicia sesión para gestionar tu cuenta." onBack={() => router.back()} premium={false} />
        <Pressable style={styles.primaryButton} onPress={() => router.replace('/auth/login' as never)}><Text style={styles.primaryButtonText}>Iniciar sesión</Text></Pressable>
      </KeyboardAwareScreen>
    );
  }

  const pageTitle = section === 'profile' ? (isAdmin ? 'Mis datos administrativos' : 'Mis datos') : section === 'notifications' ? 'Notificaciones' : section === 'delete' ? 'Eliminar cuenta' : 'Ajustes de cuenta';
  const pageSubtitle = section
    ? section === 'profile'
      ? 'Revisa o edita tu información de cuenta.'
      : section === 'notifications'
        ? 'Elige qué recordatorios quieres recibir.'
        : 'Solicitud de baja revisada por administracion.'
    : 'Elige una opción. Cada tarjeta abre una tarea concreta.';

  return (
    <KeyboardAwareScreen
      backgroundColor={format.background}
      style={{ backgroundColor: format.background }}
      contentContainerStyle={premium ? styles.premiumContent : undefined}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={format.accent} />}
    >
      <Header title={pageTitle} subtitle={pageSubtitle} onBack={back} premium={premium} />

      {isOfflineFallback && profile ? (
        <OfflineDataNotice savedAt={lastProfileSyncAt} onRetry={() => void handleRefresh()} premium={premium} label="Mostrando tu perfil guardado" />
      ) : null}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Abrir mis datos"
        style={[styles.identityCard, premium && styles.premiumCard]}
        onPress={() => section ? undefined : openSection('profile')}
      >
        <View style={[styles.avatar, { backgroundColor: avatarColor }]}><Text style={styles.avatarText}>{(fullName || profile?.email || 'U').trim().slice(0, 1).toUpperCase()}</Text></View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.identityName, premium && styles.premiumTitle]}>{fullName || profile?.email || 'Usuario UCAPSA'}</Text>
          <Text style={[styles.identityEmail, premium && styles.premiumText]}>{profile?.email ?? user.email}</Text>
          <Text style={[styles.identityRole, premium && styles.premiumPill]}>{role === 'member' ? 'Socio UCAPSA' : isAdmin ? 'Administrador' : 'Cliente UCAPSA'}</Text>
        </View>
        {!section ? <MaterialIcons name="chevron-right" size={25} color={premium ? ucapsaBrand.colors.premiumAction : format.accentDark} /> : null}
      </Pressable>

      {!section ? (
        <View style={styles.menuStack}>
          <SettingsButton
            icon="person"
            title={isAdmin ? 'Mis datos administrativos' : 'Mis datos'}
            subtitle={profileComplete ? 'Nombre, contacto y avatar.' : 'Falta completar información de contacto.'}
            badge={!profileComplete ? 'Pendiente' : undefined}
            premium={premium}
            onPress={() => openSection('profile')}
          />
          {!isAdmin ? (
            <SettingsButton
              icon="pets"
              title="Mis perros"
              subtitle="Agrega, elige o edita los perros de tu cuenta."
              premium={premium}
              onPress={() => router.push('/dog' as never)}
            />
          ) : null}
          <SettingsButton
            icon="notifications-none"
            title="Notificaciones"
            subtitle="Clases, membresía, anuncios y logros."
            premium={premium}
            onPress={() => openSection('notifications')}
          />
          {!isAdmin ? (
            <SettingsButton
              icon="delete-outline"
              title="Eliminar cuenta"
              subtitle={deletionRequested ? 'Solicitud ya registrada.' : 'Crear una solicitud para administración.'}
              badge={deletionRequested ? 'Solicitada' : undefined}
              premium={premium}
              danger
              onPress={() => openSection('delete')}
            />
          ) : null}
          <Pressable style={[styles.signOutButton, premium && styles.signOutButtonPremium]} onPress={handleSignOut}>
            <MaterialIcons name="logout" size={20} color={premium ? ucapsaBrand.colors.premiumAction : ucapsaBrand.colors.redDark} />
            <Text style={[styles.signOutText, premium && styles.signOutTextPremium]}>Cerrar sesión</Text>
          </Pressable>
        </View>
      ) : null}

      {section === 'profile' ? (
        <View style={[styles.sectionCard, premium && styles.premiumCard]}>
          <View style={styles.sectionHeaderRow}>
            <View style={{ flex: 1 }}><Text style={[styles.sectionTitle, premium && styles.premiumTitle]}>{isAdmin ? 'Mis datos administrativos' : 'Mis datos'}</Text><Text style={[styles.muted, premium && styles.premiumText]}>Nombre, contacto y avatar. Los perros se administran por separado.</Text></View>
            <Pressable style={[styles.smallButton, premium && styles.premiumSmallButton]} onPress={() => setEditing(true)}><Text style={[styles.smallButtonText, premium && styles.premiumSmallButtonText]}>{profileComplete ? 'Editar' : 'Completar'}</Text></Pressable>
          </View>
          <ReadonlyRow label="Nombre" value={profile?.full_name || 'Pendiente'} premium={premium} />
          <ReadonlyRow label="Correo" value={profile?.email || user.email || 'Pendiente'} premium={premium} />
          <ReadonlyRow label="Teléfono" value={profile?.phone || 'Pendiente'} premium={premium} />
        </View>
      ) : null}

      {section === 'notifications' ? (
        <View style={[styles.sectionCard, premium && styles.premiumCard]}>
          <NotificationSettingsCard premium={premium} />
          {isAdmin ? (
            <Pressable style={[styles.adminNoticeButton, premium && styles.adminNoticeButtonPremium]} onPress={() => router.push('/admin/notifications' as never)}>
              <MaterialIcons name="send" size={22} color={premium ? ucapsaBrand.colors.premiumAction : ucapsaBrand.colors.redDark} />
              <View style={{ flex: 1 }}><Text style={[styles.adminNoticeTitle, premium && styles.premiumTitle]}>Enviar notificacion manual</Text><Text style={[styles.muted, premium && styles.premiumText]}>Crear aviso para socios, clientes o admins.</Text></View>
              <MaterialIcons name="chevron-right" size={23} color={premium ? ucapsaBrand.colors.premiumAction : ucapsaBrand.colors.redDark} />
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {section === 'delete' && !isAdmin ? (
        <View style={[styles.sectionCard, premium && styles.premiumCard, styles.deleteCard]}>
          <Text style={[styles.sectionTitle, premium && styles.premiumTitle]}>{deletionRequested ? 'Solicitud registrada' : 'Solicitar eliminacion'}</Text>
          <Text style={[styles.muted, premium && styles.premiumText]}>{deletionRequested ? 'Administración debe revisar la solicitud antes de cualquier baja definitiva.' : 'No se borra automáticamente para evitar errores con membresía, pagos o registros.'}</Text>
          <Pressable disabled={deletionRequested} style={[styles.dangerButton, premium && styles.premiumDangerButton, deletionRequested && styles.disabled]} onPress={handleDeleteRequest}>
            <Text style={[styles.dangerButtonText, premium && styles.premiumDangerButtonText]}>{deletionRequested ? 'Eliminacion solicitada' : 'Solicitar eliminacion de cuenta'}</Text>
          </Pressable>
        </View>
      ) : null}

      <KeyboardAwareModal
        visible={editing}
        onClose={() => setEditing(false)}
        sheetStyle={premium ? styles.premiumModalSheet : undefined}
        contentContainerStyle={styles.modalContent}
      >
        <View style={styles.modalHeader}><Text style={[styles.modalTitle, premium && styles.premiumTitle]}>{isAdmin ? 'Editar datos administrativos' : 'Editar mis datos'}</Text><Pressable onPress={() => setEditing(false)}><MaterialIcons name="close" size={24} color={premium ? ucapsaBrand.colors.premiumAction : ucapsaBrand.colors.text} /></Pressable></View>
        <Text style={[styles.label, premium && styles.premiumLabel]}>Nombre completo</Text>
        <TextInput value={fullName} onChangeText={setFullName} placeholder="Nombre" placeholderTextColor={premium ? ucapsaBrand.colors.redBorder : ucapsaBrand.colors.gray} style={[styles.input, premium && styles.premiumInput]} />
        <Text style={[styles.label, premium && styles.premiumLabel]}>Correo</Text>
        <TextInput
          value={email}
          onChangeText={setEmail}
          placeholder="correo@ejemplo.com"
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          placeholderTextColor={premium ? ucapsaBrand.colors.redBorder : ucapsaBrand.colors.gray}
          style={[styles.input, premium && styles.premiumInput]}
        />
        <Text style={[styles.label, premium && styles.premiumLabel]}>Teléfono</Text>
        <TextInput value={phone} onChangeText={setPhone} placeholder="Teléfono" keyboardType="phone-pad" placeholderTextColor={premium ? ucapsaBrand.colors.redBorder : ucapsaBrand.colors.gray} style={[styles.input, premium && styles.premiumInput]} />
        <Text style={[styles.label, premium && styles.premiumLabel]}>Color de avatar</Text>
        <View style={styles.colorRow}>{avatarColors.map((color) => <Pressable key={color} onPress={() => setAvatarColor(color)} style={[styles.colorDot, { backgroundColor: color }, avatarColor === color && styles.colorDotActive]} />)}</View>
        <Pressable disabled={saving} style={[styles.primaryButton, { backgroundColor: format.primaryButton }, saving && styles.disabled]} onPress={handleSaveProfile}><Text style={[styles.primaryButtonText, { color: format.primaryButtonText }]}>{saving ? 'Guardando...' : 'Guardar cambios'}</Text></Pressable>
      </KeyboardAwareModal>
    </KeyboardAwareScreen>
  );
}

function normalizeSection(value: string | undefined, isAdmin: boolean): SettingsSection | null {
  if (value === 'profile' || value === 'notifications') return value;
  if (value === 'delete' && !isAdmin) return value;
  return null;
}

function Header({ title, subtitle, onBack, premium }: { title: string; subtitle: string; onBack: () => void; premium: boolean }) {
  return <View style={styles.headerRow}><Pressable accessibilityRole="button" accessibilityLabel="Volver" style={[styles.backButton, premium && styles.premiumSmallButton]} onPress={onBack}><MaterialIcons name="arrow-back" size={22} color={premium ? ucapsaBrand.colors.premiumAction : ucapsaBrand.colors.redDark} /></Pressable><View style={{ flex: 1 }}><Text style={[styles.title, premium && styles.premiumTitle]}>{title}</Text><Text style={[styles.muted, premium && styles.premiumText]}>{subtitle}</Text></View></View>;
}

function SettingsButton({ icon, title, subtitle, onPress, premium, badge, danger = false }: { icon: keyof typeof MaterialIcons.glyphMap; title: string; subtitle: string; onPress: () => void; premium: boolean; badge?: string; danger?: boolean }) {
  return (
    <Pressable accessibilityRole="button" style={[styles.settingsButton, premium && styles.premiumCard, danger && styles.dangerSettingsButton]} onPress={onPress}>
      <View style={[styles.settingsIcon, premium && styles.premiumSmallButton, danger && styles.dangerIcon]}><MaterialIcons name={icon} size={23} color={premium ? ucapsaBrand.colors.premiumAction : danger ? ucapsaBrand.colors.red : ucapsaBrand.colors.redDark} /></View>
      <View style={{ flex: 1 }}><View style={styles.settingsTitleRow}><Text style={[styles.settingsTitle, premium && styles.premiumTitle, danger && styles.dangerTitle]}>{title}</Text>{badge ? <Text style={[styles.badge, premium && styles.premiumPill]}>{badge}</Text> : null}</View><Text style={[styles.settingsSubtitle, premium && styles.premiumText]}>{subtitle}</Text><Text style={[styles.openLabel, premium && styles.openLabelPremium]}>Abrir</Text></View>
      <MaterialIcons name="chevron-right" size={26} color={premium ? ucapsaBrand.colors.premiumAction : danger ? ucapsaBrand.colors.red : ucapsaBrand.colors.redDark} />
    </Pressable>
  );
}

function ReadonlyRow({ label, value, premium = false }: { label: string; value: string; premium?: boolean }) {
  return <View style={[styles.readonlyRow, premium && styles.readonlyRowPremium]}><Text style={[styles.readonlyLabel, premium && styles.premiumReadonlyLabel]}>{label}</Text><Text style={[styles.readonlyValue, premium && styles.premiumReadonlyValue]}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  premiumContent: { backgroundColor: ucapsaBrand.colors.premiumBackground },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 2 },
  backButton: { width: 42, height: 42, borderRadius: 21, backgroundColor: ucapsaBrand.colors.redSoft, alignItems: 'center', justifyContent: 'center' },
  title: { color: ucapsaBrand.colors.text, fontSize: 28, fontWeight: '900' },
  muted: { color: ucapsaBrand.colors.muted, fontSize: 14, lineHeight: 20, marginTop: 4, fontWeight: '700' },
  identityCard: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: ucapsaBrand.colors.surface, borderRadius: 24, borderWidth: 1, borderColor: ucapsaBrand.colors.border, padding: 16, marginTop: 10 },
  avatar: { width: 62, height: 62, borderRadius: 31, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: ucapsaBrand.colors.surface, fontSize: 28, fontWeight: '900' },
  identityName: { color: ucapsaBrand.colors.text, fontSize: 19, fontWeight: '900' },
  identityEmail: { color: ucapsaBrand.colors.muted, fontSize: 13, marginTop: 2 },
  identityRole: { alignSelf: 'flex-start', overflow: 'hidden', backgroundColor: ucapsaBrand.colors.redSoft, color: ucapsaBrand.colors.redDark, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, fontSize: 12, fontWeight: '900', marginTop: 8 },
  menuStack: { gap: 11, marginTop: 2 },
  settingsButton: { flexDirection: 'row', alignItems: 'center', gap: 13, minHeight: 88, backgroundColor: ucapsaBrand.colors.surface, borderRadius: 22, borderWidth: 1, borderColor: ucapsaBrand.colors.border, padding: 15 },
  settingsIcon: { width: 46, height: 46, borderRadius: 16, backgroundColor: ucapsaBrand.colors.redSoft, alignItems: 'center', justifyContent: 'center' },
  settingsTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  settingsTitle: { color: ucapsaBrand.colors.text, fontSize: 17, fontWeight: '900' },
  settingsSubtitle: { color: ucapsaBrand.colors.muted, fontSize: 12, lineHeight: 17, fontWeight: '700', marginTop: 3 },
  openLabel: { color: ucapsaBrand.colors.redDark, fontSize: 11, fontWeight: '900', textTransform: 'uppercase', marginTop: 5 },
  openLabelPremium: { color: ucapsaBrand.colors.premiumAction },
  badge: { overflow: 'hidden', borderRadius: 999, backgroundColor: ucapsaBrand.colors.warningSoft, color: ucapsaBrand.colors.goldDark, paddingHorizontal: 8, paddingVertical: 4, fontSize: 10, fontWeight: '900' },
  dangerSettingsButton: { borderColor: ucapsaBrand.colors.redBorder },
  dangerIcon: { backgroundColor: ucapsaBrand.colors.surfaceAlt },
  dangerTitle: { color: ucapsaBrand.colors.red },
  sectionCard: { gap: 12, backgroundColor: ucapsaBrand.colors.surface, borderRadius: 24, borderWidth: 1, borderColor: ucapsaBrand.colors.border, padding: 16, marginTop: 2 },
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  sectionTitle: { color: ucapsaBrand.colors.text, fontSize: 20, fontWeight: '900' },
  smallButton: { borderRadius: 999, backgroundColor: ucapsaBrand.colors.redSoft, paddingHorizontal: 14, paddingVertical: 10 },
  smallButtonText: { color: ucapsaBrand.colors.redDark, fontSize: 13, fontWeight: '900' },
  readonlyRow: { paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: ucapsaBrand.colors.premiumMuted },
  readonlyRowPremium: { borderBottomColor: withAlpha(ucapsaBrand.colors.gold, 0.16) },
  readonlyLabel: { color: ucapsaBrand.colors.muted, fontSize: 12, fontWeight: '800', textTransform: 'uppercase' },
  readonlyValue: { color: ucapsaBrand.colors.text, fontSize: 16, fontWeight: '900', marginTop: 4 },
  signOutButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 18, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, paddingVertical: 13 },
  signOutButtonPremium: { backgroundColor: withAlpha(ucapsaBrand.colors.surface, 0.06), borderColor: withAlpha(ucapsaBrand.colors.gold, 0.3) },
  signOutText: { color: ucapsaBrand.colors.redDark, fontSize: 14, fontWeight: '900' },
  signOutTextPremium: { color: ucapsaBrand.colors.premiumAction },
  adminNoticeButton: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 18, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.background, padding: 14 },
  adminNoticeButtonPremium: { borderColor: withAlpha(ucapsaBrand.colors.gold, 0.3), backgroundColor: withAlpha(ucapsaBrand.colors.gold, 0.08) },
  adminNoticeTitle: { color: ucapsaBrand.colors.text, fontSize: 15, fontWeight: '900' },
  deleteCard: { borderColor: ucapsaBrand.colors.redBorder },
  dangerButton: { backgroundColor: ucapsaBrand.colors.red, borderRadius: 18, paddingVertical: 14, alignItems: 'center', marginTop: 6 },
  dangerButtonText: { color: ucapsaBrand.colors.surface, fontSize: 14, fontWeight: '900' },
  primaryButton: { backgroundColor: ucapsaBrand.colors.red, borderRadius: 18, paddingVertical: 14, alignItems: 'center', marginTop: 12 },
  primaryButtonText: { color: ucapsaBrand.colors.surface, fontSize: 15, fontWeight: '900' },
  modalContent: { gap: 10 },
  premiumModalSheet: { backgroundColor: ucapsaBrand.colors.premiumSurface, borderTopWidth: 1, borderColor: withAlpha(ucapsaBrand.colors.gold, 0.34) },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 4 },
  modalTitle: { color: ucapsaBrand.colors.text, fontSize: 21, fontWeight: '900' },
  label: { color: ucapsaBrand.colors.text, fontSize: 12, fontWeight: '900', marginTop: 3 },
  input: { borderRadius: 15, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, paddingHorizontal: 13, paddingVertical: 11, color: ucapsaBrand.colors.text, fontSize: 15 },
  colorRow: { flexDirection: 'row', gap: 10, flexWrap: 'wrap', marginVertical: 5 },
  colorDot: { width: 36, height: 36, borderRadius: 18, borderWidth: 2, borderColor: ucapsaBrand.colors.surface },
  colorDotActive: { borderColor: ucapsaBrand.colors.cameraDark, transform: [{ scale: 1.08 }] },
  disabled: { opacity: 0.55 },
  premiumCard: { backgroundColor: ucapsaBrand.colors.premiumSurface, borderColor: withAlpha(ucapsaBrand.colors.gold, 0.34) },
  premiumTitle: { color: ucapsaBrand.colors.surface },
  premiumText: { color: ucapsaBrand.colors.premiumMuted },
  premiumPill: { backgroundColor: ucapsaBrand.colors.premiumAction, color: ucapsaBrand.colors.premiumActionText },
  premiumSmallButton: { backgroundColor: withAlpha(ucapsaBrand.colors.gold, 0.14), borderWidth: 1, borderColor: withAlpha(ucapsaBrand.colors.gold, 0.25) },
  premiumSmallButtonText: { color: ucapsaBrand.colors.premiumAction },
  premiumReadonlyLabel: { color: ucapsaBrand.colors.redBorder },
  premiumReadonlyValue: { color: ucapsaBrand.colors.surface },
  premiumDangerButton: { backgroundColor: ucapsaBrand.colors.premiumActionText, borderWidth: 1, borderColor: ucapsaBrand.colors.gold },
  premiumDangerButtonText: { color: ucapsaBrand.colors.premiumAction },
  premiumLabel: { color: ucapsaBrand.colors.premiumAction },
  premiumInput: { borderColor: withAlpha(ucapsaBrand.colors.gold, 0.34), backgroundColor: ucapsaBrand.colors.premiumBackground, color: ucapsaBrand.colors.surface },
});
