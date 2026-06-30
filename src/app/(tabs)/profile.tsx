import { MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import { Link, router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Image, Modal, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';

import { SocialLinksRow } from '../../components/ui/SocialLinksRow';
import { KeyboardAwareScreen } from '../../components/ui/KeyboardAwareScreen';
import { ucapsaBrand } from '../../constants/brand';
import { useSession } from '../../hooks/useSession';
import { supabase } from '../../lib/supabase';
import { getVisibleAnnouncements } from '../../services/announcements.service';
import { getVisibleEvents } from '../../services/events.service';
import { getAdminMembershipRows, getMembershipStatusLabel, getMyMembership, isMembershipDateExpired } from '../../services/memberships.service';
import { requestAccountDeletion, updateMyProfile } from '../../services/profiles.service';
import type { Membership, Profile } from '../../types/app.types';

const avatarColors = ['#C91F37', '#8F1324', '#2563eb', '#7c3aed', '#db2777', '#0f766e'];
const wordmark = require('../../../assets/images/brand/ucapsa-wordmark.png');
const mark = require('../../../assets/images/brand/ucapsa-mark.png');

export default function ProfileScreen() {
  const { loading, user, profile, role, isAdmin, signOut, refreshProfile } = useSession();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [dogName, setDogName] = useState('');
  const [avatarColor, setAvatarColor] = useState(ucapsaBrand.colors.red);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [profileModalVisible, setProfileModalVisible] = useState(false);
  const [profileModalEditing, setProfileModalEditing] = useState(false);
  const [clientMembership, setClientMembership] = useState<Membership | null>(null);
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
      setClientMembership(await getMyMembership());
    } catch {
      setClientMembership(null);
    }
  }, [isAdmin, user]);

  useEffect(() => {
    void loadAdminData();
  }, [loadAdminData]);

  useEffect(() => {
    void loadClientMembership();
  }, [loadClientMembership]);

  useFocusEffect(
    useCallback(() => {
      if (isAdmin) void loadAdminData();
      else void loadClientMembership();
      return undefined;
    }, [isAdmin, loadAdminData, loadClientMembership]),
  );

  async function handleRefresh() {
    setRefreshing(true);
    try {
      await refreshProfile();
      if (isAdmin) await loadAdminData();
      else await loadClientMembership();
    } finally {
      setRefreshing(false);
    }
  }

  const clientProfileComplete = useMemo(
    () => Boolean((profile?.full_name ?? '').trim() && (profile?.phone ?? '').trim() && (profile?.dog_name ?? '').trim()),
    [profile],
  );
  const showReadonlyClientView = !isAdmin && clientProfileComplete && !editMode;
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
      if (!isAdmin) setEditMode(false);
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
      <KeyboardAwareScreen>
        <Text style={styles.title}>Perfil</Text>
        <Text style={styles.muted}>Cargando sesion...</Text>
      </KeyboardAwareScreen>
    );
  }

  if (!user) {
    return (
      <KeyboardAwareScreen>
        <View style={styles.guestHero}>
          <Image source={wordmark} style={styles.wordmark} resizeMode="contain" />
          <Text style={styles.title}>Perfil</Text>
          <Text style={styles.muted}>Inicia sesion para ver tu perfil, membresia y credencial digital.</Text>
        </View>

        <Link href="/auth/login" asChild>
          <Pressable style={styles.primaryButton}><Text style={styles.primaryButtonText}>Iniciar sesion</Text></Pressable>
        </Link>

        <Link href="/auth/register" asChild>
          <Pressable style={styles.secondaryButton}><Text style={styles.secondaryButtonText}>Crear cuenta</Text></Pressable>
        </Link>

        <SocialLinksRow />
      </KeyboardAwareScreen>
    );
  }

  return (
    <KeyboardAwareScreen refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={ucapsaBrand.colors.red} />}>
      <View style={styles.heroCard}>
        <View style={styles.heroCardTop}>
          <View style={[styles.avatar, { backgroundColor: avatarColor }]}> 
            <Text style={styles.avatarText}>{(fullName || profile?.email || 'U').trim().slice(0, 1).toUpperCase()}</Text>
          </View>
          <View style={styles.heroCardMeta}>
            <Text style={styles.name}>{fullName || profile?.email || 'Usuario'}</Text>
            <Text style={styles.email}>{profile?.email ?? user.email}</Text>
            <View style={styles.badgeRow}>
              <Text style={styles.rolePill}>Rol: {role ?? 'client'}</Text>
              {isAdmin ? <Text style={styles.rolePillAlt}>Admin</Text> : null}
            </View>
          </View>
          <Pressable style={styles.markBadge} onPress={() => { if (isAdmin) { setProfileModalVisible(true); setProfileModalEditing(false); } }}>
            {isAdmin ? <MaterialIcons name="more-vert" size={24} color={ucapsaBrand.colors.redDark} /> : <Image source={mark} style={styles.markBadgeImage} resizeMode="contain" />}
          </Pressable>
        </View>
      </View>


      {!isAdmin ? (
        <View style={styles.clientMembershipCard}>
          <Text style={styles.sectionEyebrow}>Perfil de cliente</Text>
          <Text style={styles.sectionTitle}>Estado UCAPSA</Text>
          <Text style={styles.clientMembershipText}>
            {!clientMembership ? 'Aun no tienes membresia registrada.' : `Membresia: ${getMembershipStatusLabel(clientMembership.status)}`}
          </Text>
          {clientMembership?.status === 'pending' ? (
            <Text style={styles.clientMembershipWarning}>Tu solicitud esta pendiente de revision.</Text>
          ) : null}
          {clientMembership && ['rejected', 'cancelled', 'expired'].includes(clientMembership.status) ? (
            <Text style={styles.clientMembershipWarning}>Membresia no aceptada, no reconocida o pendiente de contrato. Consulta con administracion.</Text>
          ) : null}
          <Text style={styles.clientMembershipHint}>Las credenciales, QR, membresia y clases activas se consultan en Mi UCAPSA.</Text>
          <Pressable style={styles.primaryButton} onPress={() => router.push('/membership' as never)}>
            <Text style={styles.primaryButtonText}>{clientMembership?.status === 'pending' ? 'Ver solicitud' : clientMembership ? 'Abrir Mi UCAPSA' : 'Solicitar membresia'}</Text>
          </Pressable>
        </View>
      ) : null}

      {isAdmin ? (
        <>
          <View style={styles.sectionHeader}>
            <View>
              <Text style={styles.sectionEyebrow}>Panel general</Text>
              <Text style={styles.sectionTitle}>Estadisticas</Text>
            </View>
          </View>

          <View style={styles.adminStatsGrid}>
            <SmallStat label="Clientes" value={adminStats.clients} icon="account" onPress={() => openAdminUsers('clients_and_members')} />
            <SmallStat label="Socios" value={adminStats.members} icon="badge-account" onPress={() => openAdminUsers('members')} />
            <SmallStat label="Membresias activas" value={adminStats.activeMemberships} icon="check-decagram" onPress={() => openMembershipTable('active', 'name_asc')} />
            <SmallStat label="Falta pago" value={adminStats.pendingPayments} icon="cash-remove" onPress={() => openMembershipTable('payment_pending_this_month', 'followup')} />
            <SmallStat label="Solicitudes" value={adminStats.pendingRequests} icon="email-outline" onPress={() => openMembershipTable('pending_requests', 'name_asc')} />
            <SmallStat label="Vigencia vencida" value={adminStats.expiredMemberships} icon="calendar-alert" onPress={() => openMembershipTable('expired_by_date', 'name_asc')} />
            <SmallStat label="Anuncios" value={adminStats.announcements} icon="bullhorn" onPress={() => router.push('/admin/announcements' as never)} />
            <SmallStat label="Eventos" value={adminStats.events} icon="calendar-month" onPress={() => router.push('/admin/events' as never)} />
          </View>

          <View style={styles.quickActionsCard}>
            <Text style={styles.quickActionsTitle}>Accesos rapidos</Text>
            <View style={styles.quickActionsGrid}>
              <QuickAction label="Mi UCAPSA" icon="badge" onPress={() => router.push('/membership' as never)} />
              <QuickAction label="Anuncios" icon="campaign" onPress={() => router.push('/announcements' as never)} />
              <QuickAction label="Calendario" icon="event" onPress={() => router.push('/calendar' as never)} />
              <QuickAction label="Clases" icon="school" onPress={() => router.push('/admin/classes' as never)} />
              <QuickAction label="Admin socios" icon="groups" onPress={() => router.push('/admin/members' as never)} />
            </View>
          </View>
        </>
      ) : null}

      {!isAdmin && showReadonlyClientView ? (
        <View style={styles.readonlyCard}>
          <ReadonlyRow label="Nombre" value={profile?.full_name ?? ''} />
          <ReadonlyRow label="Telefono" value={profile?.phone ?? ''} />
          <ReadonlyRow label="Perro" value={profile?.dog_name ?? ''} />
          <Pressable style={styles.secondaryButton} onPress={() => setEditMode(true)}>
            <Text style={styles.secondaryButtonText}>Editar informacion</Text>
          </Pressable>
        </View>
      ) : !isAdmin ? (
        <View style={styles.formCard}>
          <Text style={styles.formTitle}>Mis datos</Text>
          <Text style={styles.label}>Nombre completo</Text>
          <TextInput value={fullName} onChangeText={setFullName} placeholder="Tu nombre" style={styles.input} autoCapitalize="words" />

          <Text style={styles.label}>Telefono</Text>
          <TextInput value={phone} onChangeText={setPhone} placeholder="Telefono" style={styles.input} keyboardType="phone-pad" />

          <Text style={styles.label}>Nombre de tu perro</Text>
          <TextInput value={dogName} onChangeText={setDogName} placeholder="Ej. Max, Luna, Toby" style={styles.input} autoCapitalize="words" />

          <Text style={styles.label}>Color de avatar</Text>
          <View style={styles.colorRow}>
            {avatarColors.map((color) => (
              <Pressable key={color} onPress={() => setAvatarColor(color)} style={[styles.colorDot, { backgroundColor: color }, avatarColor === color && styles.colorDotActive]} />
            ))}
          </View>

          <Pressable disabled={saving} onPress={handleSaveProfile} style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>{saving ? 'Guardando...' : 'Guardar perfil'}</Text>
          </Pressable>

          {clientProfileComplete ? (
            <Pressable style={styles.secondaryButton} onPress={() => setEditMode(false)}>
              <Text style={styles.secondaryButtonText}>Cancelar edicion</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {!isAdmin && deletionRequested ? (
        <View style={styles.noticeBox}>
          <Text style={styles.noticeTitle}>Eliminacion solicitada</Text>
          <Text style={styles.noticeText}>Tu solicitud ya fue registrada. Administracion revisara la cuenta antes de cualquier baja definitiva.</Text>
        </View>
      ) : null}

      <SocialLinksRow />

      {!isAdmin ? (
        <Pressable disabled={deletionRequested} onPress={handleDeleteRequest} style={[styles.dangerGhostButton, deletionRequested && styles.disabledButton]}>
          <Text style={styles.dangerGhostText}>{deletionRequested ? 'Eliminacion solicitada' : 'Solicitar eliminacion de cuenta'}</Text>
        </Pressable>
      ) : null}

      <Pressable onPress={signOut} style={styles.secondaryButton}>
        <Text style={styles.secondaryButtonText}>Cerrar sesion</Text>
      </Pressable>

      <Modal visible={profileModalVisible} transparent animationType="slide" onRequestClose={() => setProfileModalVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.profileModalCard}>
            <View style={styles.profileModalHeader}>
              <Text style={styles.profileModalTitle}>Mi perfil administrativo</Text>
              <Pressable onPress={() => setProfileModalVisible(false)}>
                <MaterialIcons name="close" size={24} color={ucapsaBrand.colors.text} />
              </Pressable>
            </View>

            {!profileModalEditing ? (
              <>
                <ReadonlyRow label="Nombre" value={fullName || 'Sin nombre'} />
                <ReadonlyRow label="Correo de contacto" value={email || 'Sin correo'} />
                <ReadonlyRow label="Telefono" value={phone || 'Sin telefono'} />
                <ReadonlyRow label="Rol" value={role ?? 'client'} />
                <Pressable style={styles.primaryButton} onPress={() => setProfileModalEditing(true)}>
                  <Text style={styles.primaryButtonText}>Editar perfil</Text>
                </Pressable>
              </>
            ) : (
              <>
                <Text style={styles.label}>Nombre completo</Text>
                <TextInput value={fullName} onChangeText={setFullName} placeholder="Nombre" style={styles.input} />
                <Text style={styles.label}>Correo de contacto</Text>
                <TextInput value={email} onChangeText={setEmail} placeholder="Correo" keyboardType="email-address" autoCapitalize="none" style={styles.input} />
                <Text style={styles.label}>Telefono</Text>
                <TextInput value={phone} onChangeText={setPhone} placeholder="Telefono" keyboardType="phone-pad" style={styles.input} />
                <Text style={styles.label}>Color de avatar</Text>
                <View style={styles.colorRow}>
                  {avatarColors.map((color) => (
                    <Pressable key={color} onPress={() => setAvatarColor(color)} style={[styles.colorDot, { backgroundColor: color }, avatarColor === color && styles.colorDotActive]} />
                  ))}
                </View>
                <ReadonlyRow label="Rol" value={role ?? 'client'} />
                <Pressable
                  disabled={saving}
                  style={styles.primaryButton}
                  onPress={async () => {
                    await handleSaveProfile();
                    setProfileModalEditing(false);
                  }}
                >
                  <Text style={styles.primaryButtonText}>{saving ? 'Guardando...' : 'Guardar perfil'}</Text>
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

function ReadonlyRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.readonlyRow}>
      <Text style={styles.readonlyLabel}>{label}</Text>
      <Text style={styles.readonlyValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  guestHero: { backgroundColor: '#fff', borderRadius: 30, borderWidth: 1, borderColor: ucapsaBrand.colors.border, padding: 22, gap: 8 },
  wordmark: { width: 180, height: 42, marginBottom: 6 },
  heroCard: { backgroundColor: '#fff', borderRadius: 30, borderWidth: 1, borderColor: ucapsaBrand.colors.border, padding: 18 },
  heroCardTop: { flexDirection: 'row', alignItems: 'center' },
  heroCardMeta: { flex: 1, marginLeft: 14 },
  avatar: { width: 68, height: 68, borderRadius: 34, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontSize: 30, fontWeight: '900' },
  name: { color: ucapsaBrand.colors.text, fontSize: 20, fontWeight: '900' },
  email: { color: ucapsaBrand.colors.muted, fontSize: 13, marginTop: 2 },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  rolePill: { overflow: 'hidden', backgroundColor: ucapsaBrand.colors.redSoft, color: ucapsaBrand.colors.redDark, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, fontSize: 12, fontWeight: '900' },
  rolePillAlt: { overflow: 'hidden', backgroundColor: '#F4F4F5', color: ucapsaBrand.colors.muted, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, fontSize: 12, fontWeight: '800' },
  markBadge: { width: 40, height: 40, borderRadius: 20, backgroundColor: ucapsaBrand.colors.redSoft, alignItems: 'center', justifyContent: 'center' },
  markBadgeImage: { width: 22, height: 22 },
  title: { color: ucapsaBrand.colors.text, fontSize: 29, fontWeight: '900', marginTop: 6 },
  muted: { color: ucapsaBrand.colors.muted, fontSize: 15, lineHeight: 22, marginTop: 8, marginBottom: 20 },
  sectionHeader: { marginTop: 2 },
  sectionEyebrow: { color: ucapsaBrand.colors.red, fontSize: 12, fontWeight: '900', letterSpacing: 0.7, textTransform: 'uppercase' },
  sectionTitle: { color: ucapsaBrand.colors.text, fontSize: 22, fontWeight: '900', marginTop: 4 },
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
  clientMembershipText: { color: ucapsaBrand.colors.text, fontSize: 15, fontWeight: '800', marginTop: 8, lineHeight: 21 },
  clientMembershipWarning: { color: ucapsaBrand.colors.redDark, fontSize: 13, fontWeight: '800', marginTop: 8, lineHeight: 19 },
  clientMembershipHint: { color: ucapsaBrand.colors.muted, fontSize: 13, fontWeight: '700', marginTop: 10, lineHeight: 19 },
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



