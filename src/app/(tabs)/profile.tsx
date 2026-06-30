import { MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Image, Modal, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';

import { AchievementBadgeGrid, AchievementDetailModal, AchievementSummary } from '../../components/domain/AchievementBadgeGrid';
import { SocialLinksRow } from '../../components/ui/SocialLinksRow';
import { KeyboardAwareScreen } from '../../components/ui/KeyboardAwareScreen';
import { ucapsaBrand } from '../../constants/brand';
import { resolveUcapsaFormat } from '../../constants/ucapsaFormats';
import { useSession } from '../../hooks/useSession';
import { supabase } from '../../lib/supabase';
import { getVisibleAnnouncements } from '../../services/announcements.service';
import { getVisibleEvents } from '../../services/events.service';
import { getAdminMembershipRows, getMembershipStatusLabel, getMyMembership, isMembershipDateExpired } from '../../services/memberships.service';
import { getMyProgramEnrollments } from '../../services/programs.service';
import { getMyAchievements, type AchievementWithState } from '../../services/achievements.service';
import { requestAccountDeletion, updateMyProfile } from '../../services/profiles.service';
import type { Membership, Profile, ProgramEnrollmentWithDetails } from '../../types/app.types';

const avatarColors = ['#C91F37', '#8F1324', '#2563eb', '#7c3aed', '#db2777', '#0f766e'];
const wordmark = require('../../../assets/images/brand/ucapsa-wordmark.png');
const mark = require('../../../assets/images/brand/ucapsa-mark.png');

const programAchievementCodes = new Set(['puppy_completed', 'comandos_basico_completed', 'comandos_medio_completed', 'comandos_avanzado_completed']);

export default function ProfileScreen() {
  const { loading, user, profile, role, isAdmin, signOut, refreshProfile } = useSession();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [dogName, setDogName] = useState('');
  const [avatarColor, setAvatarColor] = useState(ucapsaBrand.colors.red);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [profileModalVisible, setProfileModalVisible] = useState(false);
  const [profileModalEditing, setProfileModalEditing] = useState(false);
  const [clientMembership, setClientMembership] = useState<Membership | null>(null);
  const [programEnrollments, setProgramEnrollments] = useState<ProgramEnrollmentWithDetails[]>([]);
  const [achievements, setAchievements] = useState<AchievementWithState[]>([]);
  const [achievementsLoading, setAchievementsLoading] = useState(false);
  const [selectedAchievement, setSelectedAchievement] = useState<AchievementWithState | null>(null);
  const [adminStats, setAdminStats] = useState({
    clients: 0,
    members: 0,
    activeMemberships: 0,
    pendingPayments: 0,
    pendingRequests: 0,
    expiredMemberships: 0,
    announcements: 0,
    events: 0,
  });

  const baseFormat = useMemo(
    () => resolveUcapsaFormat({
      user,
      role,
      isAdmin,
      membershipStatus: clientMembership?.status ?? null,
    }),
    [user, role, isAdmin, clientMembership?.status],
  );
  const isPremium = Boolean(user) && baseFormat.key === 'member' && !isAdmin;

  useEffect(() => {
    setFullName(profile?.full_name ?? '');
    setEmail(profile?.email ?? user?.email ?? '');
    setPhone(profile?.phone ?? '');
    setDogName(profile?.dog_name ?? '');
    setAvatarColor(profile?.avatar_color ?? ucapsaBrand.colors.red);
  }, [profile, user?.email]);

  const loadAdminData = useCallback(async () => {
    if (!isAdmin) return;

    const [rows, announcements, events, profilesResult] = await Promise.all([
      getAdminMembershipRows(),
      getVisibleAnnouncements(),
      getVisibleEvents(),
      supabase.from('profiles').select('role'),
    ]);

    const profiles = (profilesResult.data ?? []) as Pick<Profile, 'role'>[];

    setAdminStats({
      clients: profiles.filter((item) => item.role === 'client' || item.role === 'member').length,
      members: profiles.filter((item) => item.role === 'member').length,
      activeMemberships: rows.filter((row) => row.membership.status === 'active').length,
      pendingPayments: rows.filter((row) => row.membership.current_payment_status === 'pending').length,
      pendingRequests: rows.filter((row) => row.membership.status === 'pending').length,
      expiredMemberships: rows.filter((row) => isMembershipDateExpired(row.membership)).length,
      announcements: announcements.length,
      events: events.length,
    });
  }, [isAdmin]);

  const loadClientMembership = useCallback(async () => {
    if (isAdmin || !user) return;
    try {
      const [membershipResult, programResult] = await Promise.all([getMyMembership(), getMyProgramEnrollments()]);
      setClientMembership(membershipResult);
      setProgramEnrollments(programResult);
    } catch {
      setClientMembership(null);
      setProgramEnrollments([]);
    }
  }, [isAdmin, user]);


  const loadAchievements = useCallback(async () => {
    if (isAdmin || !user) {
      setAchievements([]);
      setAchievementsLoading(false);
      return;
    }

    setAchievementsLoading(true);
    try {
      setAchievements(await getMyAchievements());
    } catch {
      setAchievements([]);
    } finally {
      setAchievementsLoading(false);
    }
  }, [isAdmin, user]);

  useEffect(() => {
    void loadAdminData();
  }, [loadAdminData]);

  useEffect(() => {
    void loadClientMembership();
  }, [loadClientMembership]);

  useEffect(() => {
    void loadAchievements();
  }, [loadAchievements]);

  useFocusEffect(
    useCallback(() => {
      if (isAdmin) void loadAdminData();
      else {
        void loadClientMembership();
        void loadAchievements();
      }
      return undefined;
    }, [isAdmin, loadAdminData, loadClientMembership, loadAchievements]),
  );

  async function handleRefresh() {
    setRefreshing(true);
    try {
      await refreshProfile();
      if (isAdmin) await loadAdminData();
      else {
        await loadClientMembership();
        await loadAchievements();
      }
    } finally {
      setRefreshing(false);
    }
  }

  const clientProfileComplete = useMemo(
    () => Boolean((profile?.full_name ?? '').trim() && (profile?.phone ?? '').trim() && (profile?.dog_name ?? '').trim()),
    [profile],
  );
  const hasProgramAchievement = achievements.some((item) => item.unlocked && programAchievementCodes.has(item.definition.code));
  const canRequestMembership = hasProgramAchievement || programEnrollments.some((item) => item.enrollment.status === 'active' || item.enrollment.status === 'completed');
  const deletionRequested = Boolean(profile?.deletion_requested_at);

  async function handleSaveProfile() {
    if (!user) return;

    if (!isAdmin && !fullName.trim()) {
      Alert.alert('Falta nombre', 'Tu perfil necesita un nombre para mostrarlo en la credencial.');
      return;
    }

    try {
      setSaving(true);
      await updateMyProfile({
        full_name: fullName,
        email,
        phone,
        dog_name: isAdmin ? '' : dogName,
        avatar_color: avatarColor,
      });
      await refreshProfile();
      Alert.alert('Perfil actualizado', 'Tus datos se guardaron correctamente.');
      setProfileModalVisible(false);
      setProfileModalEditing(false);
    } catch (error) {
      Alert.alert('No se pudo guardar', error instanceof Error ? error.message : 'Intenta de nuevo.');
    } finally {
      setSaving(false);
    }
  }


  function openMembershipTable(filterValue: string, sortValue?: string) {
    const sortParam = sortValue ? `&sort=${sortValue}` : '';
    router.push(`/membership?view=table&filter=${filterValue}${sortParam}` as never);
  }

  function openAdminUsers(filterValue: 'clients_and_members' | 'members' | 'clients' | 'admins') {
    router.push(`/admin/users?filter=${filterValue}` as never);
  }

  function handleDeleteRequest() {
    Alert.alert(
      'Solicitar eliminacion de cuenta',
      'Por seguridad, esta accion crea una solicitud para administracion. No borra tu cuenta automaticamente.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Solicitar',
          style: 'destructive',
          onPress: async () => {
            try {
              await requestAccountDeletion('Solicitud desde Perfil.');
              await refreshProfile();
              Alert.alert('Solicitud enviada', 'Administracion revisara la eliminacion de tu cuenta.');
            } catch (error) {
              Alert.alert('No se pudo solicitar', error instanceof Error ? error.message : 'Intenta de nuevo.');
            }
          },
        },
      ],
    );
  }

  if (loading) {
    return (
      <KeyboardAwareScreen style={{ backgroundColor: baseFormat.background }}>
        <Text style={styles.title}>Perfil</Text>
        <Text style={styles.muted}>Cargando sesion...</Text>
      </KeyboardAwareScreen>
    );
  }

  if (!user) {
    return (
      <KeyboardAwareScreen style={{ backgroundColor: ucapsaBrand.colors.background }}>
        <View style={styles.guestHero}>
          <Image source={wordmark} style={styles.wordmark} resizeMode="contain" />
          <Text style={styles.title}>Perfil</Text>
          <Text style={styles.muted}>Inicia sesion para ver tu perfil, membresia y credencial digital.</Text>
        </View>

        <Pressable style={[styles.primaryButton, isPremium && styles.premiumPrimaryButton]} onPress={() => router.push('/auth/login' as never)}><Text style={[styles.primaryButtonText, isPremium && styles.premiumPrimaryButtonText]}>Iniciar sesion</Text></Pressable>

        <Pressable style={[styles.secondaryButton, isPremium && styles.premiumSecondaryButton]} onPress={() => router.push('/auth/register' as never)}><Text style={[styles.secondaryButtonText, isPremium && styles.premiumSecondaryButtonText]}>Crear cuenta</Text></Pressable>

        <SocialLinksRow premium={false} />
      </KeyboardAwareScreen>
    );
  }

  return (
    <KeyboardAwareScreen style={{ backgroundColor: isPremium ? '#270711' : baseFormat.background }} contentContainerStyle={isPremium ? styles.premiumScreenContent : undefined} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={baseFormat.accent} />}>
      <View style={[styles.heroCard, { backgroundColor: isPremium ? '#6D0817' : baseFormat.surface, borderColor: isPremium ? 'rgba(250,204,21,0.42)' : baseFormat.border, overflow: 'hidden' }]}>
        {isPremium ? <View style={styles.premiumGlowA} /> : null}
        {isPremium ? <View style={styles.premiumGlowB} /> : null}
        <View style={styles.heroCardTop}>
          <View style={[styles.avatar, { backgroundColor: avatarColor }]}> 
            <Text style={styles.avatarText}>{(fullName || profile?.email || 'U').trim().slice(0, 1).toUpperCase()}</Text>
          </View>
          <View style={styles.heroCardMeta}>
            <Text style={[styles.name, { color: isPremium ? '#FFFFFF' : ucapsaBrand.colors.text }]}>{fullName || profile?.email || 'Usuario'}</Text>
            <Text style={[styles.email, { color: isPremium ? '#FFE3E8' : ucapsaBrand.colors.muted }]}>{profile?.email ?? user.email}</Text>
            <View style={styles.badgeRow}>
              <Text style={[styles.rolePill, isPremium && styles.rolePillPremium]}>Rol: {role ?? 'client'}</Text>
              {isAdmin ? <Text style={styles.rolePillAlt}>Admin</Text> : null}
            </View>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Abrir ajustes de cuenta" style={[styles.markBadge, isPremium && styles.markBadgePremium]} onPress={() => router.push('/account-settings' as never)}>
            <MaterialIcons name="settings" size={22} color={isPremium ? '#FFE8B5' : ucapsaBrand.colors.redDark} />
          </Pressable>
        </View>
      </View>

      {!isAdmin ? (
        <View style={[styles.clientMembershipCard, isPremium && styles.clientMembershipCardPremium]}>
          <Text style={[styles.sectionEyebrow, isPremium && styles.sectionEyebrowPremium]}>Perfil de cliente</Text>
          <Text style={[styles.sectionTitle, isPremium && styles.sectionTitlePremium]}>Estado UCAPSA</Text>
          <Text style={[styles.clientMembershipText, isPremium && styles.clientMembershipTextPremium]}>
            {!clientMembership
              ? achievementsLoading
                ? 'Revisando tus logros y requisitos de membresia...'
                : canRequestMembership
                  ? 'Ya puedes solicitar membresia porque tienes Puppy o Comandos registrado o completado.'
                  : 'Aun no puedes solicitar membresia. Primero debes estar inscrito o haber completado Puppy o Comandos.'
              : `Membresia: ${getMembershipStatusLabel(clientMembership.status)}`}
          </Text>
          {clientMembership?.status === 'pending' ? (
            <Text style={[styles.clientMembershipWarning, isPremium && styles.clientMembershipWarningPremium]}>Tu solicitud esta pendiente de revision.</Text>
          ) : null}
          {clientMembership && ['rejected', 'cancelled', 'expired'].includes(clientMembership.status) ? (
            <Text style={[styles.clientMembershipWarning, isPremium && styles.clientMembershipWarningPremium]}>Membresia no aceptada, no reconocida o pendiente de contrato. Consulta con administracion.</Text>
          ) : null}
          <Text style={[styles.clientMembershipHint, isPremium && styles.clientMembershipHintPremium]}>Las credenciales, QR, membresia y clases activas se consultan en Mi UCAPSA.</Text>
          <Pressable style={[styles.primaryButton, isPremium && styles.premiumPrimaryButton]} onPress={() => router.push('/membership' as never)}>
            <Text style={[styles.primaryButtonText, isPremium && styles.premiumPrimaryButtonText]}>{clientMembership?.status === 'pending' ? 'Ver solicitud' : clientMembership ? 'Abrir Mi UCAPSA' : achievementsLoading ? 'Revisando...' : canRequestMembership ? 'Solicitar membresia' : 'Ver requisitos'}</Text>
          </Pressable>
        </View>
      ) : null}

      {!isAdmin ? (
        <View style={[styles.achievementsCard, isPremium && styles.achievementsCardPremium]}>
          <View style={styles.achievementsHeader}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.sectionEyebrow, isPremium && styles.sectionEyebrowPremium]}>Logros</Text>
              <Text style={[styles.sectionTitle, isPremium && styles.sectionTitlePremium]}>Medallas UCAPSA</Text>
            </View>
            <Pressable style={[styles.achievementsLink, isPremium && styles.achievementsLinkPremium]} onPress={() => router.push('/achievements' as never)}>
              <Text style={[styles.achievementsLinkText, isPremium && styles.achievementsLinkTextPremium]}>Ver todos</Text>
            </Pressable>
          </View>
          <AchievementSummary items={achievements} premium={isPremium} onPress={() => router.push('/achievements' as never)} />
          <AchievementBadgeGrid items={achievements} premium={isPremium} maxItems={4} onSelect={setSelectedAchievement} />
        </View>
      ) : null}

      {isAdmin ? (
        <View style={styles.adminSettingsHintCard}>
          <View style={styles.adminSettingsHintIcon}>
            <MaterialIcons name="admin-panel-settings" size={22} color={ucapsaBrand.colors.red} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.quickActionsTitle}>Panel administrativo</Text>
            <Text style={styles.adminSettingsHintText}>Las estadisticas, notificaciones y ajustes de cuenta ahora viven en el engrane superior para no saturar Perfil.</Text>
          </View>
          <Pressable style={styles.adminSettingsHintButton} onPress={() => router.push('/account-settings' as never)}>
            <Text style={styles.adminSettingsHintButtonText}>Abrir</Text>
          </Pressable>
        </View>
      ) : null}

      <SocialLinksRow premium={isPremium} />

      <Pressable style={[styles.secondaryButton, isPremium && styles.premiumSecondaryButton]} onPress={() => router.push('/account-settings' as never)}>
        <Text style={[styles.secondaryButtonText, isPremium && styles.premiumSecondaryButtonText]}>Ajustes, datos y notificaciones</Text>
      </Pressable>

      <AchievementDetailModal item={selectedAchievement} premium={isPremium} onClose={() => setSelectedAchievement(null)} />

      <Modal visible={profileModalVisible} transparent animationType="slide" onRequestClose={() => setProfileModalVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.profileModalCard, isPremium && styles.premiumBodyCard]}>
            <View style={styles.profileModalHeader}>
              <Text style={[styles.profileModalTitle, isPremium && styles.premiumBodyTitle]}>{isAdmin ? 'Mi perfil administrativo' : 'Mis datos'}</Text>
              <Pressable onPress={() => setProfileModalVisible(false)}>
                <MaterialIcons name="close" size={24} color={isPremium ? '#FFE8B5' : ucapsaBrand.colors.text} />
              </Pressable>
            </View>

            {!profileModalEditing ? (
              <>
                <ReadonlyRow label="Nombre" value={fullName || 'Sin nombre'} />
                <ReadonlyRow label="Correo de contacto" value={email || 'Sin correo'} />
                <ReadonlyRow label="Telefono" value={phone || 'Sin telefono'} />
                {!isAdmin ? <ReadonlyRow label="Perro" value={dogName || 'Sin registrar'} /> : null}
                <ReadonlyRow label="Rol" value={role ?? 'client'} />
                <Pressable style={[styles.primaryButton, isPremium && styles.premiumPrimaryButton]} onPress={() => setProfileModalEditing(true)}>
                  <Text style={[styles.primaryButtonText, isPremium && styles.premiumPrimaryButtonText]}>Editar perfil</Text>
                </Pressable>
              </>
            ) : (
              <>
                <Text style={[styles.label, isPremium && styles.premiumLabel]}>Nombre completo</Text>
                <TextInput value={fullName} onChangeText={setFullName} placeholder="Nombre" style={[styles.input, isPremium && styles.premiumInput]} />
                {isAdmin ? (
                  <>
                    <Text style={[styles.label, isPremium && styles.premiumLabel]}>Correo de contacto</Text>
                    <TextInput value={email} onChangeText={setEmail} placeholder="Correo" keyboardType="email-address" autoCapitalize="none" style={[styles.input, isPremium && styles.premiumInput]} />
                  </>
                ) : (
                  <ReadonlyRow label="Correo" value={email || 'Sin correo'} premium={isPremium} />
                )}
                <Text style={[styles.label, isPremium && styles.premiumLabel]}>Telefono</Text>
                <TextInput value={phone} onChangeText={setPhone} placeholder="Telefono" keyboardType="phone-pad" style={[styles.input, isPremium && styles.premiumInput]} />
                {!isAdmin ? (
                  <>
                    <Text style={[styles.label, isPremium && styles.premiumLabel]}>Nombre de tu perro</Text>
                    <TextInput value={dogName} onChangeText={setDogName} placeholder="Ej. Max, Luna, Toby" style={[styles.input, isPremium && styles.premiumInput]} autoCapitalize="words" />
                  </>
                ) : null}
                <Text style={[styles.label, isPremium && styles.premiumLabel]}>Color de avatar</Text>
                <View style={styles.colorRow}>
                  {avatarColors.map((color) => (
                    <Pressable key={color} onPress={() => setAvatarColor(color)} style={[styles.colorDot, { backgroundColor: color }, avatarColor === color && styles.colorDotActive]} />
                  ))}
                </View>
                <ReadonlyRow label="Rol" value={role ?? 'client'} />
                <Pressable
                  disabled={saving}
                  style={[styles.primaryButton, isPremium && styles.premiumPrimaryButton]}
                  onPress={handleSaveProfile}
                >
                  <Text style={[styles.primaryButtonText, isPremium && styles.premiumPrimaryButtonText]}>{saving ? 'Guardando...' : 'Guardar perfil'}</Text>
                </Pressable>
              </>
            )}
          </View>
        </View>
      </Modal>
    </KeyboardAwareScreen>
  );
}

function SmallStat({ label, value, icon, onPress }: { label: string; value: number; icon: keyof typeof MaterialCommunityIcons.glyphMap; onPress: () => void }) {
  return (
    <Pressable style={styles.statCard} onPress={onPress}>
      <View style={styles.statIconWrap}><MaterialCommunityIcons name={icon} size={18} color={ucapsaBrand.colors.red} /></View>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statHint}>Abrir</Text>
    </Pressable>
  );
}

function QuickAction({ label, icon, onPress }: { label: string; icon: keyof typeof MaterialIcons.glyphMap; onPress: () => void }) {
  return (
    <Pressable style={styles.quickAction} onPress={onPress}>
      <View style={styles.quickActionIcon}><MaterialIcons name={icon} size={18} color={ucapsaBrand.colors.red} /></View>
      <Text style={styles.quickActionText}>{label}</Text>
    </Pressable>
  );
}

function ReadonlyRow({ label, value, premium = false }: { label: string; value: string; premium?: boolean }) {
  return (
    <View style={styles.readonlyRow}>
      <Text style={[styles.readonlyLabel, premium && styles.premiumReadonlyLabel]}>{label}</Text>
      <Text style={[styles.readonlyValue, premium && styles.premiumReadonlyValue]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  premiumScreenContent: { backgroundColor: '#270711' },
  guestHero: { backgroundColor: '#fff', borderRadius: 30, borderWidth: 1, borderColor: ucapsaBrand.colors.border, padding: 22, gap: 8 },
  wordmark: { width: 180, height: 42, marginBottom: 6 },
  heroCard: { position: 'relative', backgroundColor: '#fff', borderRadius: 30, borderWidth: 1, borderColor: ucapsaBrand.colors.border, padding: 18 },
  premiumGlowA: { position: 'absolute', top: -56, right: -40, width: 150, height: 150, borderRadius: 75, backgroundColor: '#FACC15', opacity: 0.18 },
  premiumGlowB: { position: 'absolute', bottom: -70, left: -48, width: 150, height: 150, borderRadius: 75, backgroundColor: '#12040A', opacity: 0.34 },
  premiumBodyCard: { backgroundColor: '#38111B', borderColor: 'rgba(250,204,21,0.34)' },
  premiumBodyTitle: { color: '#FFE8B5' },
  premiumBodyText: { color: '#FFE3E8' },
  premiumLabel: { color: '#FFE8B5' },
  premiumInput: { backgroundColor: '#270711', borderColor: 'rgba(250,204,21,0.30)', color: '#FFFFFF' },
  premiumReadonlyLabel: { color: '#FFE8B5' },
  premiumReadonlyValue: { color: '#FFFFFF' },
  premiumPrimaryButton: { backgroundColor: '#FACC15' },
  premiumPrimaryButtonText: { color: '#4A0710' },
  premiumSecondaryButton: { backgroundColor: 'rgba(255,255,255,0.08)', borderColor: 'rgba(250,204,21,0.34)' },
  premiumSecondaryButtonText: { color: '#FFE8B5' },
  premiumDangerGhostButton: { borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.05)' },
  premiumDangerGhostText: { color: '#FFE8B5' },
  premiumNoticeBox: { backgroundColor: '#38111B', borderColor: 'rgba(250,204,21,0.34)' },
  achievementsCard: { gap: 12, padding: 16, borderRadius: 26, backgroundColor: '#fff', borderWidth: 1, borderColor: ucapsaBrand.colors.border },
  achievementsCardPremium: { backgroundColor: '#38111B', borderColor: 'rgba(250,204,21,0.34)' },
  achievementsHeader: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 },
  achievementsLink: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 9, backgroundColor: ucapsaBrand.colors.redSoft },
  achievementsLinkPremium: { backgroundColor: 'rgba(250,204,21,0.16)', borderWidth: 1, borderColor: 'rgba(250,204,21,0.28)' },
  achievementsLinkText: { color: ucapsaBrand.colors.redDark, fontSize: 12, fontWeight: '900' },
  achievementsLinkTextPremium: { color: '#FFE8B5' },
  heroCardTop: { flexDirection: 'row', alignItems: 'center' },
  heroCardMeta: { flex: 1, marginLeft: 14 },
  avatar: { width: 68, height: 68, borderRadius: 34, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontSize: 30, fontWeight: '900' },
  name: { color: ucapsaBrand.colors.text, fontSize: 20, fontWeight: '900' },
  email: { color: ucapsaBrand.colors.muted, fontSize: 13, marginTop: 2 },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  rolePill: { overflow: 'hidden', backgroundColor: ucapsaBrand.colors.redSoft, color: ucapsaBrand.colors.redDark, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, fontSize: 12, fontWeight: '900' },
  rolePillPremium: { backgroundColor: '#FFE8B5', color: '#7A1020' },
  rolePillAlt: { overflow: 'hidden', backgroundColor: '#F4F4F5', color: ucapsaBrand.colors.muted, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, fontSize: 12, fontWeight: '800' },
  markBadge: { width: 40, height: 40, borderRadius: 20, backgroundColor: ucapsaBrand.colors.redSoft, alignItems: 'center', justifyContent: 'center' },
  markBadgeImage: { width: 22, height: 22 },

  markBadgePremium: { backgroundColor: 'rgba(250,204,21,0.16)', borderWidth: 1, borderColor: 'rgba(250,204,21,0.34)' },
  adminSettingsHintCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff', borderRadius: 24, borderWidth: 1, borderColor: ucapsaBrand.colors.border, padding: 14 },
  adminSettingsHintIcon: { width: 42, height: 42, borderRadius: 21, backgroundColor: ucapsaBrand.colors.redSoft, alignItems: 'center', justifyContent: 'center' },
  adminSettingsHintText: { color: ucapsaBrand.colors.muted, fontSize: 13, lineHeight: 18, fontWeight: '700', marginTop: 4 },
  adminSettingsHintButton: { borderRadius: 999, backgroundColor: ucapsaBrand.colors.redSoft, paddingHorizontal: 12, paddingVertical: 9 },
  adminSettingsHintButtonText: { color: ucapsaBrand.colors.redDark, fontSize: 12, fontWeight: '900' },
  title: { color: ucapsaBrand.colors.text, fontSize: 29, fontWeight: '900', marginTop: 6 },
  muted: { color: ucapsaBrand.colors.muted, fontSize: 15, lineHeight: 22, marginTop: 8, marginBottom: 20 },
  sectionHeader: { marginTop: 2 },
  sectionEyebrow: { color: ucapsaBrand.colors.red, fontSize: 12, fontWeight: '900', letterSpacing: 0.7, textTransform: 'uppercase' },
  sectionTitle: { color: ucapsaBrand.colors.text, fontSize: 22, fontWeight: '900', marginTop: 4 },
  sectionTitlePremium: { color: '#FFE8B5' },
  sectionEyebrowPremium: { color: '#FFE8B5' },
  adminStatsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  statCard: { width: '48%', backgroundColor: '#fff', borderRadius: 22, borderWidth: 1, borderColor: ucapsaBrand.colors.border, padding: 14 },
  statIconWrap: { width: 34, height: 34, borderRadius: 17, backgroundColor: ucapsaBrand.colors.redSoft, alignItems: 'center', justifyContent: 'center' },
  statValue: { color: ucapsaBrand.colors.text, fontSize: 26, fontWeight: '900', marginTop: 10 },
  statLabel: { color: ucapsaBrand.colors.muted, fontSize: 13, fontWeight: '800', marginTop: 4 },
  statHint: { color: ucapsaBrand.colors.red, fontSize: 11, fontWeight: '900', marginTop: 8, textTransform: 'uppercase' },
  quickActionsCard: { backgroundColor: '#fff', borderRadius: 26, borderWidth: 1, borderColor: ucapsaBrand.colors.border, padding: 16 },
  quickActionsTitle: { color: ucapsaBrand.colors.text, fontSize: 18, fontWeight: '900', marginBottom: 12 },
  quickActionsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  quickAction: { width: '48%', flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: ucapsaBrand.colors.surfaceAlt, borderWidth: 1, borderColor: ucapsaBrand.colors.border, borderRadius: 18, paddingHorizontal: 12, paddingVertical: 12 },
  quickActionIcon: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  quickActionText: { color: ucapsaBrand.colors.text, fontSize: 14, fontWeight: '900' },
  clientMembershipCard: { backgroundColor: '#fff', borderRadius: 26, borderWidth: 1, borderColor: ucapsaBrand.colors.border, padding: 18 },
  clientMembershipCardPremium: { backgroundColor: '#38111B', borderColor: 'rgba(250,204,21,0.34)' },
  clientMembershipText: { color: ucapsaBrand.colors.text, fontSize: 15, fontWeight: '800', marginTop: 8, lineHeight: 21 },
  clientMembershipTextPremium: { color: '#FFE3E8' },
  clientMembershipWarning: { color: ucapsaBrand.colors.redDark, fontSize: 13, fontWeight: '800', marginTop: 8, lineHeight: 19 },
  clientMembershipWarningPremium: { color: '#FFE8B5' },
  clientMembershipHint: { color: ucapsaBrand.colors.muted, fontSize: 13, fontWeight: '700', marginTop: 10, lineHeight: 19 },
  clientMembershipHintPremium: { color: '#FFE3E8' },
  noticeBox: { backgroundColor: '#FFF7ED', borderWidth: 1, borderColor: '#FED7AA', borderRadius: 20, padding: 14 },
  noticeTitle: { color: '#9A3412', fontSize: 15, fontWeight: '900' },
  noticeText: { color: '#9A3412', fontSize: 13, fontWeight: '700', lineHeight: 19, marginTop: 4 },
  disabledButton: { opacity: 0.55 },
  readonlyCard: { backgroundColor: '#fff', borderRadius: 26, borderWidth: 1, borderColor: ucapsaBrand.colors.border, padding: 18 },
  readonlyRow: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F5E5E8' },
  readonlyLabel: { color: ucapsaBrand.colors.muted, fontSize: 12, fontWeight: '800', textTransform: 'uppercase' },
  readonlyValue: { color: ucapsaBrand.colors.text, fontSize: 16, fontWeight: '900', marginTop: 4 },
  formCard: { backgroundColor: '#fff', borderRadius: 26, borderWidth: 1, borderColor: ucapsaBrand.colors.border, padding: 18 },
  formTitle: { color: ucapsaBrand.colors.text, fontSize: 20, fontWeight: '900' },
  label: { color: ucapsaBrand.colors.text, fontSize: 13, fontWeight: '800', marginBottom: 6, marginTop: 12 },
  input: { backgroundColor: '#fff', borderWidth: 1, borderColor: ucapsaBrand.colors.border, borderRadius: 16, color: ucapsaBrand.colors.text, fontSize: 16, paddingHorizontal: 14, paddingVertical: 12 },
  colorRow: { flexDirection: 'row', gap: 10, marginTop: 4, marginBottom: 10, flexWrap: 'wrap' },
  colorDot: { width: 34, height: 34, borderRadius: 17, borderWidth: 2, borderColor: '#fff' },
  colorDotActive: { borderColor: ucapsaBrand.colors.text, transform: [{ scale: 1.08 }] },
  primaryButton: { backgroundColor: ucapsaBrand.colors.red, borderRadius: 18, paddingVertical: 14, alignItems: 'center', marginTop: 16 },
  primaryButtonText: { color: '#fff', fontSize: 15, fontWeight: '900' },
  secondaryButton: { backgroundColor: '#fff', borderWidth: 1, borderColor: ucapsaBrand.colors.border, borderRadius: 18, paddingVertical: 14, alignItems: 'center', marginTop: 12 },
  secondaryButtonText: { color: ucapsaBrand.colors.text, fontSize: 15, fontWeight: '900' },
  dangerGhostButton: { paddingVertical: 14, alignItems: 'center', marginTop: 8 },
  dangerGhostText: { color: '#C43B4E', fontSize: 14, fontWeight: '800' },

  modalBackdrop: { flex: 1, backgroundColor: 'rgba(37, 21, 26, 0.35)', justifyContent: 'flex-end' },
  profileModalCard: { backgroundColor: ucapsaBrand.colors.background, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, gap: 10, borderWidth: 1, borderColor: ucapsaBrand.colors.border },
  profileModalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  profileModalTitle: { color: ucapsaBrand.colors.text, fontSize: 22, fontWeight: '900' },
});
