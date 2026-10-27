import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Linking, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';

import { NotificationSettingsCard } from '../components/domain/NotificationSettingsCard';
import { KeyboardAwareModal } from '../components/ui/KeyboardAwareModal';
import { KeyboardAwareScreen } from '../components/ui/KeyboardAwareScreen';
import { OfflineDataNotice } from '../components/ui/OfflineDataNotice';
import { getMemberThemeFormat, memberThemeChoices, resolveUcapsaFormat, type UcapsaFormat } from '../constants/ucapsaFormats';
import { useMemberAppearance } from '../hooks/useMemberAppearance';
import { ucapsaBrand, withAlpha } from '../constants/brand';
import { UCAPSA_ACCOUNT_DELETION_PUBLIC_URL } from '../constants/legal';
import { phoneVerificationEnabled } from '../constants/phoneVerification';
import { preregistrationEnabled } from '../constants/preregistrationFeature';
import { useSession } from '../hooks/useSession';
import { devWarn } from '../lib/client-diagnostics';
import { showPlatformDialog } from '../utils/staff-dialog';
import { deleteMyAccount, getAccountDeletionStatusLabel, getMyAccountDeletionRequest, isAccountDeletionOpen, type AccountDeletionRequest } from '../services/account-deletion.service';
import { requestMyEmailChange, updateMyProfile } from '../services/profiles.service';
import { resendEmailConfirmation } from '../services/auth.service';
import { isSupportedContactPhone, normalizeContactPhone, sameContactPhone } from '../utils/phone-contact';
import { getMyMembership, getMembershipEffectiveStatus } from '../services/memberships.service';
import { DEFAULT_WRITE_TIMEOUT_MS, friendlyWriteError, withOperationTimeout } from '../utils/async.utils';

type SettingsSection = 'notifications' | 'profile' | 'appearance' | 'delete';

export default function AccountSettingsScreen() {
  const { loading, user, profile, role, isAdmin, isTrainer, isStaff, signOut, refreshProfile, acceptProfile, isOfflineFallback, lastProfileSyncAt, reviewPreregistrationLink } = useSession();
  const params = useLocalSearchParams<{ section?: string; from?: string }>();
  const fromProfile = params.from === 'profile';
  const [membershipVisualAccess, setMembershipVisualAccess] = useState<{ userId: string; active: boolean } | null>(null);
  // Consulta comercial de solo lectura; la apariencia nunca concede permisos.
  useEffect(() => {
    const userId = user?.id;
    if (!userId || isStaff || role === 'member') return;
    let active = true;
    void getMyMembership()
      .then((membership) => {
        if (active) setMembershipVisualAccess({ userId, active: getMembershipEffectiveStatus(membership) === 'active' });
      })
      .catch((error) => {
        devWarn('Could not verify Socio appearance access.', error);
        if (active) setMembershipVisualAccess({ userId, active: false });
      });
    return () => { active = false; };
  }, [user?.id, isStaff, role]);
  const hasSocioAppearance = role === 'member' || (membershipVisualAccess?.userId === user?.id && membershipVisualAccess?.active === true);
  const section = normalizeSection(params.section, isAdmin, isTrainer, hasSocioAppearance);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [editing, setEditing] = useState(false);
  const [showLinkingHelp, setShowLinkingHelp] = useState(false);
  const [checkingPreregistration, setCheckingPreregistration] = useState(false);
  const [resendingEmail, setResendingEmail] = useState(false);
  const [deletionRequest, setDeletionRequest] = useState<AccountDeletionRequest | null>(null);
  const [deletionLoading, setDeletionLoading] = useState(false);
  const { memberTheme, setMemberTheme } = useMemberAppearance();
  const [appearanceError, setAppearanceError] = useState<string | null>(null);
  const [appearanceSaving, setAppearanceSaving] = useState(false);

  const format = useMemo(() => resolveUcapsaFormat({ user, role, isAdmin, memberTheme, membershipStatus: hasSocioAppearance ? 'active' : null }), [user, role, isAdmin, memberTheme, hasSocioAppearance]);
  const premium = Boolean(user) && format.key === 'member' && !isStaff;
  const deletionOpen = isAccountDeletionOpen(deletionRequest);
  const deletionCompleted = deletionRequest?.status === 'completed';
  const deletionLocked = deletionCompleted || deletionRequest?.status === 'blocked';
  const deletionStatusLabel = getAccountDeletionStatusLabel(deletionRequest?.status);
  const mainPhone = profile?.phone || (user?.phone_confirmed_at ? user.phone : null) || null;
  const mainPhoneHasInvalidFormat = Boolean(mainPhone && !isSupportedContactPhone(mainPhone));
  const verifiedPhoneMatches = Boolean(user?.phone_confirmed_at && sameContactPhone(mainPhone, user.phone));
  const verifiedPhoneMismatch = Boolean(user?.phone_confirmed_at && user.phone && mainPhone && !verifiedPhoneMatches);
  const profileComplete = Boolean((profile?.full_name ?? '').trim() && (mainPhone ?? '').trim());

  async function checkMyPreregistrations() {
    if (checkingPreregistration || isOfflineFallback) return;
    try {
      setCheckingPreregistration(true);
      const status = await reviewPreregistrationLink();
      // El primer expediente puede vincularse automáticamente.
      // Las vinculaciones posteriores muestran la invitación y exigen aprobación.
      if (status === 'available') return;
      const detail = status === 'requested'
        ? 'Tu solicitud de revisión se envió a Administración. El expediente actual no cambiará mientras se revisa.'
        : status === 'linked'
        ? 'Tu primer expediente quedó vinculado automáticamente a tu cuenta.'
        : status === 'conflict'
        ? 'Hay datos duplicados. Administración puede revisar el caso; no se transferirá ningún expediente automáticamente.'
        : status === 'unverified'
          ? 'Agrega tu celular al perfil o inicia sesión con el correo asociado al preregistro y vuelve a consultar.'
          : status === 'not_applicable'
            ? 'Inicia sesión con una cuenta conectada para consultar expedientes.'
            : 'Por ahora no hay expedientes pendientes asociados al celular o correo de tu cuenta.';
      Alert.alert('Preinscripciones', detail);
    } catch (cause) {
      Alert.alert('No se pudo consultar',
        cause instanceof Error ? cause.message : 'Vuelve a intentarlo.');
    } finally {
      setCheckingPreregistration(false);
    }
  }


  useEffect(() => {
    setFullName(profile?.full_name ?? '');
    setEmail(user?.email ?? profile?.email ?? '');
    setContactEmail(profile?.preregistration_contact_email ?? '');
    setPhone(profile?.phone ?? (user?.phone_confirmed_at ? user.phone ?? '' : ''));
  }, [profile, user?.email]);

  const refreshDeletionRequest = useCallback(async () => {
    if (!user || isAdmin) {
      setDeletionRequest(null);
      return;
    }
    const request = await getMyAccountDeletionRequest();
    setDeletionRequest(request);
  }, [isAdmin, user]);

  useEffect(() => {
    let active = true;
    if (!user || isAdmin) {
      setDeletionRequest(null);
      setDeletionLoading(false);
      return undefined;
    }

    setDeletionLoading(true);
    void getMyAccountDeletionRequest()
      .then((request) => {
        if (active) setDeletionRequest(request);
      })
      .catch((error) => {
        // La sección sigue disponible aunque temporalmente no pueda leer el estado remoto.
        devWarn('Could not refresh account deletion status in settings.', error);
      })
      .finally(() => {
        if (active) setDeletionLoading(false);
      });

    return () => {
      active = false;
    };
  }, [isAdmin, user]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.allSettled([
        refreshProfile(),
        refreshDeletionRequest(),
      ]);
    } finally {
      setRefreshing(false);
    }
  }, [refreshDeletionRequest, refreshProfile]);

  async function handleResendEmailVerification() {
    // Solo el correo de acceso en Auth, nunca el correo de contacto de un preregistro.
    if (!user?.email || user.email_confirmed_at || isOfflineFallback || resendingEmail) return;
    setResendingEmail(true);
    try {
      await withOperationTimeout(
        resendEmailConfirmation(user.email),
        DEFAULT_WRITE_TIMEOUT_MS,
        'email-confirmation-resend',
      );
      Alert.alert('Solicitud enviada', 'Revisa tu correo de acceso y la carpeta de spam. El correo solo quedará verificado cuando abras el enlace de confirmación.');
    } catch (error) {
      Alert.alert('No se pudo solicitar la verificación', friendlyWriteError(error));
    } finally {
      setResendingEmail(false);
    }
  }

  async function handleSaveProfile() {
    if (!user) {
      Alert.alert('Sesión no disponible', 'Vuelve a iniciar sesión antes de guardar cambios en tu cuenta.');
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();
    // No bloquear modificaciones de nombre o correo por un contacto legado
    // inválido que NO se está editando; se conserva hasta que lo corrijan.
    const phoneChanged = phone.trim() !== (profile?.phone ?? '').trim();
    let normalizedPhone: string | null | undefined;
    if (phoneChanged) {
      try {
        normalizedPhone = phone.trim() ? normalizeContactPhone(phone) : null;
      } catch (error) {
        Alert.alert('Celular inválido', error instanceof Error ? error.message : 'Revisa el número.');
        return;
      }
      if (user.phone_confirmed_at && user.phone && !sameContactPhone(normalizedPhone, user.phone)) {
        Alert.alert('Celular verificado', 'Para usar un número diferente, primero actualiza la verificación de tu celular de acceso.');
        return;
      }
    }
    const normalizedContactEmail = contactEmail.trim().toLowerCase();
    const contactChanged = (phoneChanged && !sameContactPhone(normalizedPhone, profile?.phone))
      || normalizedContactEmail !== (profile?.preregistration_contact_email ?? '').trim().toLowerCase()
      || normalizedEmail !== (user.email ?? '').trim().toLowerCase();
    const currentAuthEmail = (user.email ?? '').trim().toLowerCase();
    // Una cuenta iniciada solo con teléfono puede no tener correo de acceso.
    // El correo para el primer preregistro es independiente de Auth.
    if ((normalizedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail))
      || (!normalizedEmail && currentAuthEmail)) {
      Alert.alert('Correo inválido', 'Revisa el correo de acceso antes de guardar.');
      return;
    }
    if (preregistrationEnabled && normalizedContactEmail
      && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedContactEmail)) {
      Alert.alert('Correo de contacto inválido', 'Revisa el correo de vinculación.');
      return;
    }

    setSaving(true);
    try {
      const emailChanged = Boolean(normalizedEmail) && normalizedEmail !== currentAuthEmail;
      const emailChange = emailChanged ? await requestMyEmailChange(normalizedEmail) : null;

      const savedProfile = await withOperationTimeout(
        updateMyProfile({
          full_name: fullName,
          ...(phoneChanged ? { phone: normalizedPhone } : {}),
          ...(preregistrationEnabled ? { preregistration_contact_email: normalizedContactEmail } : {}),
        }),
        DEFAULT_WRITE_TIMEOUT_MS,
        'profile-save',
      );
      await acceptProfile(savedProfile);
      setEditing(false);

      if (emailChange?.confirmationRequired) {
        Alert.alert('Confirma tu nuevo correo', `Enviamos la confirmación a ${emailChange.requestedEmail}. El cambio se reflejará al confirmarlo.`);
      } else {
        Alert.alert('Datos guardados', contactChanged && preregistrationEnabled
          ? 'Tu contacto se actualizó. UCAPSA buscará preinscripciones coincidentes; te avisará si vincula tu primer expediente o si necesita autorización.'
          : 'Tu información se actualizó correctamente.');
      }
    } catch (error) {
      Alert.alert('No se pudo guardar', friendlyWriteError(error));
    } finally {
      setSaving(false);
    }
  }

  function handleDeleteRequest() {
    if (deletionLocked || deletionLoading) return;
    showPlatformDialog(
      'Eliminar mi cuenta',
      'Se eliminarán tu cuenta y los datos asociados de UCAPSA App que no debamos conservar por obligación legal. Esta acción no se puede deshacer.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: deletionOpen ? 'Reintentar eliminación' : 'Eliminar cuenta',
          style: 'destructive',
          onPress: async () => {
            setDeletionLoading(true);
            try {
              const receipt = await withOperationTimeout(
                deleteMyAccount(),
                DEFAULT_WRITE_TIMEOUT_MS,
                'account-delete',
              );
              // Auth may already be deleted even if local sign-out cannot reach
              // the server. Do not tell someone their deletion failed in that case.
              try {
                await signOut();
              } catch (signOutError) {
                devWarn('account-settings: account deleted but local sign-out failed', signOutError);
              }
              showPlatformDialog('Cuenta eliminada', receipt.auditRecorded
                ? 'Tu cuenta de UCAPSA App fue eliminada.'
                : 'Tu cuenta fue eliminada, pero el registro administrativo requiere revisión. Puedes contactar a Administración desde la página pública de eliminación.');
              router.replace('/auth/login' as never);
            } catch (error) {
              await refreshDeletionRequest().catch((refreshError) => {
                devWarn('account-settings: failed to refresh deletion request after delete error', refreshError);
              });
              showPlatformDialog(
                'No se pudo completar',
                friendlyWriteError(
                  error,
                  'La solicitud quedó registrada. Puedes reintentar desde esta pantalla.',
                ),
              );
            } finally {
              setDeletionLoading(false);
            }
          },
        },
      ],
    );
  }

  async function confirmSignOut() {
    if (signingOut) return;
    showPlatformDialog(
      'Cerrar sesión',
      '¿Quieres salir de UCAPSA en este dispositivo? Puedes volver a iniciar sesión después.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Cerrar sesión',
          onPress: async () => {
            if (signingOut) return;
            setSigningOut(true);
            try {
              await signOut();
              router.replace('/auth/login' as never);
            } catch (cause) {
              devWarn('account-settings: could not sign out.', cause);
              showPlatformDialog('No se pudo cerrar sesión',
                'Tu sesión sigue activa. Revisa la conexión e inténtalo otra vez.');
            } finally {
              setSigningOut(false);
            }
          },
        },
      ],
    );
  }

  function openSection(next: SettingsSection) {
    router.push(`/account-settings?section=${next}${fromProfile ? '&from=profile' : ''}` as never);
  }

  function back() {
    if (fromProfile) {
      router.replace('/profile' as never);
      return;
    }
    if (section) router.replace('/account-settings' as never);
    else router.back();
  }

  if (loading) {
    return <KeyboardAwareScreen><Text style={styles.title}>Ajustes</Text><Text style={styles.muted}>Cargando cuenta...</Text></KeyboardAwareScreen>;
  }

  if (!user) {
    return (
      <KeyboardAwareScreen>
        <Header title="Ajustes" subtitle="Inicia sesión para gestionar tu cuenta." onBack={() => router.back()} premium={false} format={format} />
        <Pressable style={styles.primaryButton} onPress={() => router.replace('/auth/login' as never)}><Text style={styles.primaryButtonText}>Iniciar sesión</Text></Pressable>
      </KeyboardAwareScreen>
    );
  }

  const pageTitle = section === 'profile'
    ? (isStaff ? 'Mis datos del equipo' : 'Mis datos')
    : section === 'appearance'
      ? 'Colores de socio'
      : section === 'notifications'
      ? 'Notificaciones'
      : section === 'delete'
        ? 'Eliminar cuenta'
        : 'Ajustes de cuenta';
  const pageSubtitle = section
    ? section === 'profile'
      ? 'Revisa o edita tu información de cuenta.'
      : section === 'appearance'
        ? 'Elige una paleta para tu experiencia de socio.'
        : section === 'notifications'
        ? 'Elige qué recordatorios quieres recibir.'
        : 'Consulta el estado de eliminación o solicita borrar tu cuenta y datos.'
    : 'Elige qué quieres gestionar.';

  return (
    <KeyboardAwareScreen
      backgroundColor={format.background}
      style={{ backgroundColor: format.background }}
      contentContainerStyle={premium ? { backgroundColor: format.background } : undefined}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={format.accent} />}
    >
      <Header title={pageTitle} subtitle={pageSubtitle} onBack={back} premium={premium} format={format} />

      {isOfflineFallback && profile ? (
        <OfflineDataNotice savedAt={lastProfileSyncAt} onRetry={() => void handleRefresh()} premium={premium} label="Mostrando tu perfil guardado" />
      ) : null}

      {!section ? (
        <View style={styles.menuStack}>
          <SettingsButton format={format}
            icon="person"
            title={isStaff ? 'Mis datos del equipo' : 'Mis datos'}
            subtitle={profileComplete ? 'Nombre, correo y teléfono.' : 'Falta completar información de contacto.'}
            badge={!profileComplete ? 'Pendiente' : undefined}
            premium={premium}
            onPress={() => openSection('profile')}
          />
          {!isStaff ? (
            <SettingsButton format={format}
              icon="pets"
              title="Mis perros"
              subtitle="Agrega, elige o edita los perros de tu cuenta."
              premium={premium}
              onPress={() => router.push('/dog' as never)}
            />
          ) : null}
          {premium ? (
            <SettingsButton format={format} icon="palette" title="Colores de socio"
              subtitle="Personaliza Club UCAPSA en este dispositivo."
              premium={premium} onPress={() => openSection('appearance')} />
          ) : null}
          <SettingsButton format={format}
            icon="notifications-none"
            title="Notificaciones"
            subtitle={isTrainer ? 'Resumen de clases y aforo esperado.' : 'Clases, membresía, anuncios y logros.'}
            premium={premium}
            onPress={() => openSection('notifications')}
          />
          <SettingsButton format={format}
            icon="policy"
            title="Aviso de privacidad"
            subtitle="Consulta cómo UCAPSA trata y protege tus datos."
            premium={premium}
            onPress={() => router.push('/privacy' as never)}
          />
          <SettingsButton format={format}
            icon="description"
            title="Términos de uso"
            subtitle="Consulta las reglas vigentes de UCAPSA App."
            premium={premium}
            onPress={() => router.push('/terms' as never)}
          />
          {!isAdmin ? (
            <SettingsButton format={format}
              icon="delete-outline"
              title="Eliminar cuenta"
              subtitle={deletionLoading ? 'Consultando solicitud...' : deletionRequest ? deletionStatusLabel : 'Solicita eliminar tu cuenta y los datos asociados.'}
              badge={deletionRequest ? deletionStatusLabel : undefined}
              premium={premium}
              danger
              onPress={() => openSection('delete')}
            />
          ) : null}
          <Pressable accessibilityRole="button" accessibilityLabel="Cerrar sesión"
            accessibilityState={{ disabled: signingOut }} disabled={signingOut}
            style={[styles.signOutButton, premium && styles.signOutButtonPremium, signingOut && styles.disabled]}
            onPress={() => void confirmSignOut()}>
            <MaterialIcons name="logout" size={20} color={premium ? format.accentDark : ucapsaBrand.colors.redDark} />
            <Text style={[styles.signOutText, premium && styles.signOutTextPremium]}>{signingOut ? 'Cerrando sesión…' : 'Cerrar sesión'}</Text>
          </Pressable>
        </View>
      ) : null}

      {section === 'appearance' && premium ? (
        <View style={[styles.sectionCard, { backgroundColor: format.cardBackground, borderColor: format.cardBorder }]}>
          <Text style={[styles.sectionTitle, { color: format.cardText }]}>Elige tus colores</Text>
          <Text style={[styles.sectionIntro, { color: format.muted }]}>Elige cómo quieres ver UCAPSA.</Text>
          {memberThemeChoices.map((option) => {
            const preview = getMemberThemeFormat(option.key);
            const selected = memberTheme === option.key;
            return (
              <Pressable key={option.key} accessibilityRole="radio"
                accessibilityState={{ selected, disabled: appearanceSaving }}
                accessibilityLabel={option.label} disabled={appearanceSaving}
                onPress={() => {
                  setAppearanceError(null);
                  setAppearanceSaving(true);
                  void setMemberTheme(option.key)
                    .catch(() => setAppearanceError('No se pudo guardar la paleta. Intenta de nuevo.'))
                    .finally(() => setAppearanceSaving(false));
                }}
                style={[styles.appearanceOption, { backgroundColor: preview.cardBackground, borderColor: selected ? preview.accentDark : preview.cardBorder }]}>
                <View style={[styles.appearanceDot, { backgroundColor: preview.accentDark }]} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.settingsTitle, { color: preview.cardText }]}>{option.label}</Text>
                  <View style={{ borderRadius: 9, padding: 7, marginTop: 6, backgroundColor: preview.background, borderColor: preview.cardBorder, borderWidth: 1, gap: 4 }}>
                    <View style={{ height: 9, width: 52, borderRadius: 5, backgroundColor: preview.accentDark }} />
                    <View style={{ height: 12, width: 86, borderRadius: 6, backgroundColor: preview.accentSoft }} />
                  </View>
                </View>
                <MaterialIcons name={selected ? 'radio-button-checked' : 'radio-button-unchecked'} size={24} color={preview.accentDark} />
              </Pressable>
            );
          })}
          {appearanceError ? <Text accessibilityRole="alert" style={styles.appearanceError}>{appearanceError}</Text> : null}
          <Text style={[styles.settingsSubtitle, { color: format.muted }]}>Se aplica al instante en este dispositivo.</Text>
        </View>
      ) : null}
      {section === 'profile' ? (
        <View style={[styles.sectionCard, premium && styles.premiumCard]}>
          <View style={styles.sectionHeaderRow}>
            <Text style={[styles.sectionIntro, premium && styles.premiumText]}>Nombre, correo y teléfono.</Text>
            <Pressable style={[styles.smallButton, premium && styles.premiumSmallButton]} onPress={() => setEditing(true)}><Text style={[styles.smallButtonText, premium && styles.premiumSmallButtonText]}>{profileComplete ? 'Editar' : 'Completar'}</Text></Pressable>
          </View>
          <ReadonlyRow format={format} label="Nombre" value={profile?.full_name || 'Pendiente'} premium={premium} />
          <ReadonlyRow format={format} label="Correo para iniciar sesión" value={user.email || 'Sin registrar'} premium={premium} />
          <ReadonlyRow format={format} label="Verificación del correo"
            value={user.email_confirmed_at ? 'Verificado' : 'Sin confirmar'} premium={premium} />
          {user.email && !user.email_confirmed_at ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Reenviar confirmación a mi correo de acceso"
              accessibilityState={{ disabled: resendingEmail || isOfflineFallback }}
              disabled={resendingEmail || isOfflineFallback}
              style={[styles.smallButton, premium && styles.premiumSmallButton,
                (resendingEmail || isOfflineFallback) && styles.disabled]}
              onPress={() => void handleResendEmailVerification()}>
              <Text style={[styles.smallButtonText, premium && styles.premiumSmallButtonText]}>
                {resendingEmail ? 'Solicitando verificación…' : 'Reenviar confirmación de correo'}
              </Text>
            </Pressable>
          ) : null}
          <ReadonlyRow format={format} label="Celular principal" value={mainPhone || 'Pendiente'} premium={premium} />
          {preregistrationEnabled ? (
            <ReadonlyRow format={format} label="Correo de contacto"
              value={profile?.preregistration_contact_email || 'No agregado'} premium={premium} />
          ) : null}
          <Text style={[styles.muted, premium && styles.premiumText]}>
            {verifiedPhoneMismatch
              ? 'Tus números no coinciden. Contacta a UCAPSA antes de cambiarlos.'
              : mainPhoneHasInvalidFormat
                ? 'Revisa el formato de tu celular. Puedes guardar los demás datos sin cambiarlo.'
              : verifiedPhoneMatches
                ? 'Celular verificado. Puedes iniciar sesión con él.'
                : 'Si tu celular es válido y exclusivo, también puedes usarlo para iniciar sesión.'}
          </Text>
          {!user.phone_confirmed_at && !phoneVerificationEnabled ? (
            <>
              <Pressable accessibilityRole="button" accessibilityState={{ expanded: showLinkingHelp }}
                onPress={() => setShowLinkingHelp((open) => !open)}
                style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <Text style={{ color: format.accentDark, fontWeight: '800' }}>¿Cómo encuentro mis registros anteriores?</Text>
                <MaterialIcons name={showLinkingHelp ? 'expand-less' : 'expand-more'} size={20} color={format.accentDark} />
              </Pressable>
              {showLinkingHelp ? (
                <Text style={[styles.muted, premium && styles.premiumText]}>
                  UCAPSA buscará coincidencias con tu correo o celular. No necesitas SMS para la primera vinculación. Si un registro ya pertenece a otra cuenta, Administración revisará la solicitud.
                </Text>
              ) : null}
            </>
          ) : null}
          {preregistrationEnabled && !isOfflineFallback ? (
            <Pressable accessibilityRole="button"
              accessibilityLabel="Buscar mis expedientes preinscritos pendientes"
              disabled={checkingPreregistration}
              onPress={() => void checkMyPreregistrations()}
              style={[styles.smallButton, premium && styles.premiumSmallButton]}>
              <Text style={[styles.smallButtonText, premium && styles.premiumSmallButtonText]}>
                {checkingPreregistration ? 'Consultando…' : 'Buscar mis preinscripciones'}
              </Text>
            </Pressable>
          ) : null}
          {phoneVerificationEnabled ? (
            <Pressable accessibilityRole="button"
              accessibilityLabel="Verificar mi celular para vincular la preinscripción"
              onPress={() => router.push('/verify-phone' as never)}
              style={[styles.smallButton, premium && styles.premiumSmallButton]}>
              <Text style={[styles.smallButtonText, premium && styles.premiumSmallButtonText]}>
                {user.phone_confirmed_at ? 'Actualizar celular verificado' : 'Verificar celular por SMS'}
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {section === 'notifications' ? (
        <View style={styles.notificationSection}>
          <NotificationSettingsCard premium={premium} mode={isTrainer ? 'trainer' : 'client'} />
          {isAdmin ? (
            <Pressable style={[styles.adminNoticeButton, premium && styles.adminNoticeButtonPremium]} onPress={() => router.push('/admin/notifications' as never)}>
              <MaterialIcons name="send" size={22} color={premium ? format.accentDark : ucapsaBrand.colors.redDark} />
              <View style={{ flex: 1 }}><Text style={[styles.adminNoticeTitle, premium && styles.premiumTitle]}>Enviar notificacion manual</Text><Text style={[styles.muted, premium && styles.premiumText]}>Crear aviso para socios, clientes o admins.</Text></View>
              <MaterialIcons name="chevron-right" size={23} color={premium ? format.accentDark : ucapsaBrand.colors.redDark} />
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {section === 'delete' && !isAdmin ? (
        <View style={[styles.sectionCard, premium && styles.premiumCard, styles.deleteCard]}>
          <Text style={[styles.sectionTitle, premium && styles.premiumTitle]}>{deletionRequest ? deletionStatusLabel : 'Eliminar mi cuenta'}</Text>
          <Text style={[styles.muted, premium && styles.premiumText]}>
            {deletionRequest
              ? deletionRequest.status === 'blocked'
                ? `Tu solicitud está bloqueada por conservación de datos${deletionRequest.retention_until ? ` hasta ${deletionRequest.retention_until}` : ''}. Tu cuenta aún no se ha eliminado. Administración revisará cuándo procede la supresión; reintentar no elimina el bloqueo.`
                : deletionRequest.status === 'rejected'
                  ? deletionRequest.resolution_note || 'La solicitud anterior no procedió. Puedes solicitar una nueva revisión.'
                  : deletionRequest.status === 'completed'
                    ? 'La solicitud figura como completada en el registro administrativo.'
                    : deletionRequest.status === 'in_review'
                      ? 'Tu solicitud está en revisión. La cuenta no está eliminada; puedes reintentar si no existe un bloqueo de conservación.'
                      : 'Solicitud recibida. La cuenta aún no está eliminada; puedes reintentar desde esta pantalla.'
              : 'Al confirmar, UCAPSA intentará eliminar tu cuenta de acceso, sus fotografías privadas vinculadas y los datos asociados que no deban conservarse. Si hay un impedimento, registrará la solicitud para revisión.'}
          </Text>
          {deletionRequest && deletionRequest.status !== 'completed' ? (
            <Text style={[styles.externalDeleteHint, premium && styles.premiumText]}>
              Registrar una solicitud no significa que la cuenta ya esté eliminada.
            </Text>
          ) : null}
          <Pressable accessibilityRole="button" accessibilityLabel={deletionOpen ? 'Reintentar eliminación de cuenta' : 'Eliminar mi cuenta'}
            accessibilityState={{ disabled: deletionLocked || deletionLoading }}
            disabled={deletionLocked || deletionLoading}
            style={[styles.dangerButton, premium && styles.premiumDangerButton, (deletionLocked || deletionLoading) && styles.disabled]} onPress={handleDeleteRequest}>
            <Text style={[styles.dangerButtonText, premium && styles.premiumDangerButtonText]}>
              {deletionLocked
                ? deletionStatusLabel
                : deletionLoading
                  ? 'Eliminando...'
                  : deletionOpen
                    ? 'Reintentar eliminación'
                    : 'Eliminar mi cuenta'}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="link"
            style={[styles.externalDeleteButton, premium && styles.premiumSmallButton]}
            onPress={() => {
              void Linking.openURL(UCAPSA_ACCOUNT_DELETION_PUBLIC_URL).catch((cause) => {
                devWarn('account-settings: could not open public deletion resource', cause);
                Alert.alert('No se pudo abrir', 'Puedes solicitar la eliminación escribiendo a ucapsa84@gmail.com.');
              });
            }}
          >
            <MaterialIcons name="open-in-new" size={18} color={premium ? format.accentDark : ucapsaBrand.colors.redDark} />
            <Text style={[styles.externalDeleteText, premium && styles.premiumSmallButtonText]}>Solicitar desde la web</Text>
          </Pressable>
          <Text style={[styles.externalDeleteHint, premium && styles.premiumText]}>
            La página pública permite solicitar la eliminación por correo, incluso sin acceso a la app. No confirma por sí sola que la cuenta fue eliminada.
          </Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Consultar aviso de privacidad vigente"
            style={styles.externalDeleteButton} onPress={() => router.push('/privacy' as never)}>
            <MaterialIcons name="policy" size={18} color={premium ? format.accentDark : ucapsaBrand.colors.redDark} />
            <Text style={[styles.externalDeleteText, premium && styles.premiumSmallButtonText]}>Consultar aviso de privacidad vigente</Text>
          </Pressable>
        </View>
      ) : null}

      <KeyboardAwareModal
        visible={editing}
        onClose={() => setEditing(false)}
        sheetStyle={premium ? styles.premiumModalSheet : undefined}
        contentContainerStyle={styles.modalContent}
      >
        <View style={styles.modalHeader}><Text style={[styles.modalTitle, premium && styles.premiumTitle]}>{isStaff ? 'Editar datos del equipo' : 'Editar mis datos'}</Text><Pressable onPress={() => setEditing(false)}><MaterialIcons name="close" size={24} color={premium ? ucapsaBrand.colors.premiumAction : ucapsaBrand.colors.text} /></Pressable></View>
        <Text style={[styles.label, premium && styles.premiumLabel]}>Nombre completo</Text>
        <TextInput value={fullName} onChangeText={setFullName} placeholder="Nombre" placeholderTextColor={premium ? ucapsaBrand.colors.redBorder : ucapsaBrand.colors.gray} style={[styles.input, premium && styles.premiumInput]} />
        <Text style={[styles.label, premium && styles.premiumLabel]}>Correo para iniciar sesión</Text>
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
        {preregistrationEnabled ? (
          <>
            <Text style={[styles.label, premium && styles.premiumLabel]}>Correo de contacto (si es diferente)</Text>
            <TextInput value={contactEmail} onChangeText={setContactEmail}
              placeholder="correo@ejemplo.com (opcional)"
              keyboardType="email-address" autoCapitalize="none" autoCorrect={false}
              placeholderTextColor={premium ? ucapsaBrand.colors.redBorder : ucapsaBrand.colors.gray}
              style={[styles.input, premium && styles.premiumInput]} />
            <Text style={[styles.muted, premium && styles.premiumText]}>
              Este correo ayuda a encontrar registros anteriores. No verificamos que sea tuyo y no sirve para iniciar sesión.
            </Text>
          </>
        ) : null}
        <Text style={[styles.label, premium && styles.premiumLabel]}>Número de celular</Text>
        <TextInput value={phone} onChangeText={setPhone} placeholder="Teléfono" keyboardType="phone-pad" placeholderTextColor={premium ? ucapsaBrand.colors.redBorder : ucapsaBrand.colors.gray} style={[styles.input, premium && styles.premiumInput]} />
        <Pressable disabled={saving} style={[styles.primaryButton, { backgroundColor: format.primaryButton }, saving && styles.disabled]} onPress={handleSaveProfile}><Text style={[styles.primaryButtonText, { color: format.primaryButtonText }]}>{saving ? 'Guardando...' : 'Guardar cambios'}</Text></Pressable>
      </KeyboardAwareModal>
    </KeyboardAwareScreen>
  );
}

function normalizeSection(value: string | undefined, isAdmin: boolean, isTrainer: boolean, isMember: boolean): SettingsSection | null {
  if (value === 'profile' || value === 'notifications') return value;
  if (value === 'appearance' && isMember && !isAdmin && !isTrainer) return value;
  if (value === 'delete' && !isAdmin) return value;
  return null;
}

function Header({ title, subtitle, onBack, premium, format }: { title: string; subtitle: string; onBack: () => void; premium: boolean; format: UcapsaFormat }) {
  return <View style={styles.headerRow}><Pressable accessibilityRole="button" accessibilityLabel="Volver" style={[styles.backButton, premium && styles.premiumSmallButton, premium && { backgroundColor: format.accentSoft, borderColor: format.cardBorder }]} onPress={onBack}><MaterialIcons name="arrow-back" size={22} color={premium ? format.accentDark : ucapsaBrand.colors.redDark} /></Pressable><View style={{ flex: 1 }}><Text style={[styles.title, premium && styles.premiumTitle, premium && { color: format.text }]}>{title}</Text><Text style={[styles.muted, premium && styles.premiumText, premium && { color: format.muted }]}>{subtitle}</Text></View></View>;
}

function SettingsButton({ icon, title, subtitle, onPress, premium, badge, danger = false, format }: { icon: keyof typeof MaterialIcons.glyphMap; title: string; subtitle: string; onPress: () => void; premium: boolean; badge?: string; danger?: boolean; format: UcapsaFormat }) {
  const tone = icon === 'person' ? { soft: ucapsaBrand.colors.blueSoft, text: ucapsaBrand.colors.blueDark }
    : icon === 'pets' ? { soft: ucapsaBrand.colors.greenSoft, text: ucapsaBrand.colors.greenDark }
    : icon === 'palette' ? { soft: ucapsaBrand.colors.purpleSoft, text: ucapsaBrand.colors.purpleDark }
    : icon === 'notifications-none' ? { soft: ucapsaBrand.colors.goldPale, text: ucapsaBrand.colors.goldDark }
    : { soft: format.accentSoft, text: format.accentDark };
  return (
    <Pressable accessibilityRole="button" style={[styles.settingsButton, premium && styles.premiumCard, premium && { backgroundColor: format.cardBackground, borderColor: format.cardBorder }, danger && styles.dangerSettingsButton]} onPress={onPress}>
      <View style={[styles.settingsIcon, premium && styles.premiumSmallButton, { backgroundColor: danger ? ucapsaBrand.colors.dangerSoft : tone.soft, borderColor: format.cardBorder }, danger && styles.dangerIcon]}><MaterialIcons name={icon} size={23} color={danger ? ucapsaBrand.colors.danger : tone.text} /></View>
      <View style={{ flex: 1 }}><View style={styles.settingsTitleRow}><Text style={[styles.settingsTitle, premium && styles.premiumTitle, premium && { color: format.cardText }, danger && styles.dangerTitle]}>{title}</Text>{badge ? <Text style={[styles.badge, premium && styles.premiumPill]}>{badge}</Text> : null}</View><Text style={[styles.settingsSubtitle, premium && styles.premiumText, premium && { color: format.muted }]}>{subtitle}</Text></View>
      <MaterialIcons name="chevron-right" size={26} color={premium ? format.accentDark : danger ? ucapsaBrand.colors.red : ucapsaBrand.colors.redDark} />
    </Pressable>
  );
}

function ReadonlyRow({ label, value, premium = false, format }: { label: string; value: string; premium?: boolean; format: UcapsaFormat }) {
  return <View style={[styles.readonlyRow, premium && styles.readonlyRowPremium]}><Text style={[styles.readonlyLabel, premium && styles.premiumReadonlyLabel, premium && { color: format.accentDark }]}>{label}</Text><Text style={[styles.readonlyValue, premium && styles.premiumReadonlyValue, premium && { color: format.cardText }]}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  premiumContent: { backgroundColor: ucapsaBrand.colors.premiumBackground },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 2 },
  backButton: { width: 42, height: 42, borderRadius: 21, backgroundColor: ucapsaBrand.colors.redSoft, alignItems: 'center', justifyContent: 'center' },
  title: { color: ucapsaBrand.colors.text, fontSize: 28, fontWeight: '900' },
  muted: { color: ucapsaBrand.colors.muted, fontSize: 14, lineHeight: 20, marginTop: 4, fontWeight: '700' },
  menuStack: { gap: 11, marginTop: 12 },
  settingsButton: { flexDirection: 'row', alignItems: 'center', gap: 13, minHeight: 88, backgroundColor: ucapsaBrand.colors.surface, borderRadius: 22, borderWidth: 1, borderColor: ucapsaBrand.colors.border, padding: 15 },
  settingsIcon: { width: 46, height: 46, borderRadius: 16, backgroundColor: ucapsaBrand.colors.redSoft, alignItems: 'center', justifyContent: 'center' },
  settingsTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  settingsTitle: { color: ucapsaBrand.colors.text, fontSize: 17, fontWeight: '900' },
  settingsSubtitle: { color: ucapsaBrand.colors.muted, fontSize: 12, lineHeight: 17, fontWeight: '700', marginTop: 3 },
  badge: { overflow: 'hidden', borderRadius: 999, backgroundColor: ucapsaBrand.colors.warningSoft, color: ucapsaBrand.colors.goldDark, paddingHorizontal: 8, paddingVertical: 4, fontSize: 10, fontWeight: '900' },
  dangerSettingsButton: { borderColor: ucapsaBrand.colors.redBorder },
  dangerIcon: { backgroundColor: ucapsaBrand.colors.surfaceAlt },
  dangerTitle: { color: ucapsaBrand.colors.red },
  sectionCard: { gap: 12, backgroundColor: ucapsaBrand.colors.surface, borderRadius: 24, borderWidth: 1, borderColor: ucapsaBrand.colors.border, padding: 16, marginTop: 12 },
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  sectionIntro: { flex: 1, color: ucapsaBrand.colors.muted, fontSize: 14, lineHeight: 20, fontWeight: '700' },
  sectionTitle: { color: ucapsaBrand.colors.text, fontSize: 20, fontWeight: '900' },
  smallButton: { borderRadius: 999, backgroundColor: ucapsaBrand.colors.redSoft, paddingHorizontal: 14, paddingVertical: 10 },
  smallButtonText: { color: ucapsaBrand.colors.redDark, fontSize: 13, fontWeight: '900' },
  readonlyRow: { paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: ucapsaBrand.colors.premiumMuted },
  readonlyRowPremium: { borderBottomColor: withAlpha(ucapsaBrand.colors.gold, 0.16) },
  readonlyLabel: { color: ucapsaBrand.colors.muted, fontSize: 12, fontWeight: '800', textTransform: 'uppercase' },
  readonlyValue: { color: ucapsaBrand.colors.text, fontSize: 16, fontWeight: '900', marginTop: 4 },
  notificationSection: { gap: 12, marginTop: 12 },
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
  externalDeleteButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 18, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, paddingVertical: 13 },
  externalDeleteText: { color: ucapsaBrand.colors.redDark, fontSize: 13, fontWeight: '900' },
  externalDeleteHint: { color: ucapsaBrand.colors.muted, fontSize: 11, lineHeight: 16, fontWeight: '700', textAlign: 'center' },
  primaryButton: { backgroundColor: ucapsaBrand.colors.red, borderRadius: 18, paddingVertical: 14, alignItems: 'center', marginTop: 12 },
  primaryButtonText: { color: ucapsaBrand.colors.surface, fontSize: 15, fontWeight: '900' },
  modalContent: { gap: 10 },
  premiumModalSheet: { backgroundColor: ucapsaBrand.colors.premiumSurface, borderTopWidth: 1, borderColor: withAlpha(ucapsaBrand.colors.gold, 0.34) },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 4 },
  modalTitle: { color: ucapsaBrand.colors.text, fontSize: 21, fontWeight: '900' },
  label: { color: ucapsaBrand.colors.text, fontSize: 12, fontWeight: '900', marginTop: 3 },
  input: { borderRadius: 15, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, paddingHorizontal: 13, paddingVertical: 11, color: ucapsaBrand.colors.text, fontSize: 15 },
  appearanceOption: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 2, borderRadius: 18, padding: 12 },
  appearanceDot: { width: 32, height: 32, borderRadius: 16 },
  appearanceError: { color: ucapsaBrand.colors.danger, fontSize: 13, fontWeight: '800' },
  colorRow: { flexDirection: 'row', gap: 10, flexWrap: 'wrap', marginVertical: 5 },
  colorDot: { width: 36, height: 36, borderRadius: 18, borderWidth: 2, borderColor: ucapsaBrand.colors.surface },
  colorDotActive: { borderColor: ucapsaBrand.colors.cameraDark, transform: [{ scale: 1.08 }] },
  disabled: { opacity: 0.55 },
  premiumCard: { backgroundColor: ucapsaBrand.colors.premiumSurface, borderColor: withAlpha(ucapsaBrand.colors.gold, 0.34) },
  premiumTitle: { color: ucapsaBrand.colors.premiumText },
  premiumText: { color: ucapsaBrand.colors.premiumMuted },
  premiumPill: { backgroundColor: ucapsaBrand.colors.premiumActionSoft, color: ucapsaBrand.colors.premiumActionText },
  premiumSmallButton: { backgroundColor: withAlpha(ucapsaBrand.colors.gold, 0.14), borderWidth: 1, borderColor: withAlpha(ucapsaBrand.colors.gold, 0.25) },
  premiumSmallButtonText: { color: ucapsaBrand.colors.premiumAction },
  premiumReadonlyLabel: { color: ucapsaBrand.colors.premiumAction },
  premiumReadonlyValue: { color: ucapsaBrand.colors.premiumText },
  premiumDangerButton: { backgroundColor: ucapsaBrand.colors.premiumActionText, borderWidth: 1, borderColor: ucapsaBrand.colors.gold },
  premiumDangerButtonText: { color: ucapsaBrand.colors.premiumAction },
  premiumLabel: { color: ucapsaBrand.colors.premiumAction },
  premiumInput: { borderColor: ucapsaBrand.colors.premiumBorderStrong, backgroundColor: ucapsaBrand.colors.premiumSurface, color: ucapsaBrand.colors.premiumText },
});