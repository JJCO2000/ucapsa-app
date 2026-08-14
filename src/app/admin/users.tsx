import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { KeyboardAwareScreen } from '../../components/ui/KeyboardAwareScreen';
import { ucapsaBrand } from '../../constants/brand';
import { resolveUcapsaFormat } from '../../constants/ucapsaFormats';
import { useSession } from '../../hooks/useSession';
import { supabase } from '../../lib/supabase';
import { deactivateMembershipForProfile, forceMembershipForProfile } from '../../services/memberships.service';
import {
  awardAchievementToUser,
  getAchievementsForUser,
  revokeAchievementFromUser,
  type AchievementWithState,
} from '../../services/achievements.service';
import type { AppRole, Profile } from '../../types/app.types';

type UserFilter = 'clients_and_members' | 'clients' | 'members' | 'admins';

const filterOptions: Array<{ value: UserFilter; label: string; helper: string }> = [
  { value: 'clients_and_members', label: 'Todos', helper: 'Clientes y socios' },
  { value: 'clients', label: 'Clientes', helper: 'Sin rol de socio' },
  { value: 'members', label: 'Socios', helper: 'Con membresia' },
  { value: 'admins', label: 'Admins', helper: 'Administracion' },
];

function getRoleLabel(role: AppRole) {
  if (role === 'super_admin') return 'Super admin';
  if (role === 'admin') return 'Admin';
  if (role === 'member') return 'Socio';
  return 'Cliente';
}

function matchesFilter(profile: Profile, filter: UserFilter) {
  if (filter === 'clients_and_members') return profile.role === 'client' || profile.role === 'member';
  if (filter === 'clients') return profile.role === 'client';
  if (filter === 'members') return profile.role === 'member';
  return profile.role === 'admin' || profile.role === 'super_admin';
}

function getFilterLabel(filter: UserFilter) {
  return filterOptions.find((item) => item.value === filter)?.label ?? 'Todos';
}

export default function AdminUsersScreen() {
  const { loading: sessionLoading, user, role, isAdmin } = useSession();
  const adminFormat = useMemo(() => resolveUcapsaFormat({ user, role, isAdmin: true }), [user, role]);
  const params = useLocalSearchParams<{ filter?: string; userId?: string }>();
  const adminsOnly = params.filter === 'admins';
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [filter, setFilter] = useState<UserFilter>(params.filter === 'admins' ? 'admins' : 'clients_and_members');
  const [loading, setLoading] = useState(true);
  const [savingUserId, setSavingUserId] = useState<string | null>(null);
  const [selectedProfile, setSelectedProfile] = useState<Profile | null>(null);
  const [selectedAchievements, setSelectedAchievements] = useState<AchievementWithState[]>([]);
  const [loadingAchievements, setLoadingAchievements] = useState(false);
  const handledRouteUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (typeof params.filter === 'string' && filterOptions.some((item) => item.value === params.filter)) {
      setFilter(params.filter as UserFilter);
    }
  }, [params.filter]);

  async function loadProfiles() {
    if (!isAdmin) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .order('full_name', { ascending: true, nullsFirst: false });

    if (error) throw error;
    setProfiles((data ?? []) as Profile[]);
    setLoading(false);
  }

  useEffect(() => {
    if (!isAdmin) {
      setLoading(false);
      return;
    }

    loadProfiles().catch((error) => {
      setLoading(false);
      console.warn('No se pudieron cargar usuarios:', error instanceof Error ? error.message : error);
    });
  }, [isAdmin]);

  async function refreshSelectedProfile(userId: string) {
    const { data, error } = await supabase.from('profiles').select('*').eq('user_id', userId).maybeSingle();
    if (error) throw error;
    const nextProfile = data as Profile | null;
    if (nextProfile) setSelectedProfile(nextProfile);
  }


  async function loadAchievementsForProfile(userId: string) {
    setLoadingAchievements(true);
    try {
      const rows = await getAchievementsForUser(userId);
      setSelectedAchievements(rows);
    } catch (error) {
      Alert.alert('No se pudieron cargar logros', error instanceof Error ? error.message : 'Intenta de nuevo.');
    } finally {
      setLoadingAchievements(false);
    }
  }

  function openUserDetail(profile: Profile) {
    setSelectedProfile(profile);
    if (profile.role === 'client' || profile.role === 'member') {
      void loadAchievementsForProfile(profile.user_id);
    } else {
      setSelectedAchievements([]);
    }
  }

  function handleToggleAchievement(profile: Profile, item: AchievementWithState) {
    const title = item.unlocked ? 'Quitar logro' : 'Marcar logro completado';
    const message = item.unlocked
      ? `Esto quitara ${item.definition.title} de los logros del usuario. Usalo solo si fue un error.`
      : `Esto marcara como completado: ${item.definition.unlocked_title}.`;
    const confirmLabel = item.unlocked ? 'Quitar' : 'Marcar completado';

    Alert.alert(title, message, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: confirmLabel,
        style: item.unlocked ? 'destructive' : 'default',
        onPress: async () => {
          try {
            setSavingUserId(profile.user_id);
            if (item.unlocked) {
              await revokeAchievementFromUser(profile.user_id, item.definition.code);
            } else {
              await awardAchievementToUser(profile.user_id, item.definition.code);
            }
            await loadAchievementsForProfile(profile.user_id);
            Alert.alert('Logros actualizados', item.unlocked ? 'El logro fue quitado.' : 'El logro fue marcado como completado.');
          } catch (error) {
            Alert.alert('No se pudo actualizar logro', error instanceof Error ? error.message : 'Intenta de nuevo.');
          } finally {
            setSavingUserId(null);
          }
        },
      },
    ]);
  }

  function handleForceMember(profile: Profile) {
    Alert.alert('Forzar socio', 'Esto activa o crea una membresia de socio para este cliente. El pago quedara pendiente si no estaba pagado.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Activar socio',
        onPress: async () => {
          try {
            setSavingUserId(profile.user_id);
            await forceMembershipForProfile(profile);
            await loadProfiles();
            await refreshSelectedProfile(profile.user_id);
            Alert.alert('Socio activado', 'La persona ya aparece como socio.');
          } catch (error) {
            Alert.alert('No se pudo activar socio', error instanceof Error ? error.message : 'Intenta de nuevo.');
          } finally {
            setSavingUserId(null);
          }
        },
      },
    ]);
  }


  function handleBackToClient(profile: Profile) {
    Alert.alert('Volver a cliente', 'Esto desactiva la membresia visible y cambia el rol a cliente. No borra historial.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Volver a cliente',
        style: 'destructive',
        onPress: async () => {
          try {
            setSavingUserId(profile.user_id);
            await deactivateMembershipForProfile(profile);
            await loadProfiles();
            await refreshSelectedProfile(profile.user_id);
            Alert.alert('Actualizado', 'La persona volvio a cliente.');
          } catch (error) {
            Alert.alert('No se pudo actualizar', error instanceof Error ? error.message : 'Intenta de nuevo.');
          } finally {
            setSavingUserId(null);
          }
        },
      },
    ]);
  }

  const filteredProfiles = useMemo(
    () => profiles.filter((profile) => matchesFilter(profile, filter)),
    [profiles, filter],
  );

  useEffect(() => {
    const routeUserId = typeof params.userId === 'string' ? params.userId.trim() : '';
    if (!routeUserId || profiles.length === 0 || handledRouteUserIdRef.current === routeUserId) return;
    const profile = profiles.find((item) => item.user_id === routeUserId);
    if (!profile) return;
    handledRouteUserIdRef.current = routeUserId;
    openUserDetail(profile);
  }, [params.userId, profiles]);

  const counts = useMemo(() => ({
    clientsAndMembers: profiles.filter((profile) => profile.role === 'client' || profile.role === 'member').length,
    clients: profiles.filter((profile) => profile.role === 'client').length,
    members: profiles.filter((profile) => profile.role === 'member').length,
    admins: profiles.filter((profile) => profile.role === 'admin' || profile.role === 'super_admin').length,
  }), [profiles]);

  if (sessionLoading) {
    return (
      <KeyboardAwareScreen style={{ backgroundColor: adminFormat.background }}>
        <View style={styles.deniedBox}>
          <MaterialCommunityIcons name="account-lock" size={42} color={ucapsaBrand.colors.redDark} />
          <Text style={styles.deniedTitle}>Revisando acceso</Text>
          <Text style={styles.deniedText}>Cargando sesion...</Text>
        </View>
      </KeyboardAwareScreen>
    );
  }

  if (!user) {
    return (
      <KeyboardAwareScreen style={{ backgroundColor: adminFormat.background }}>
        <View style={styles.deniedBox}>
          <MaterialCommunityIcons name="lock" size={42} color={ucapsaBrand.colors.redDark} />
          <Text style={styles.deniedTitle}>Acceso restringido</Text>
          <Text style={styles.deniedText}>Inicia sesion con una cuenta administrativa para ver usuarios.</Text>
          <Pressable style={styles.primaryButton} onPress={() => router.push('/auth/login' as never)}>
            <Text style={styles.primaryButtonText}>Iniciar sesion</Text>
          </Pressable>
        </View>
      </KeyboardAwareScreen>
    );
  }

  if (!isAdmin) {
    return (
      <KeyboardAwareScreen style={{ backgroundColor: adminFormat.background }}>
        <View style={styles.deniedBox}>
          <MaterialCommunityIcons name="lock" size={42} color={ucapsaBrand.colors.redDark} />
          <Text style={styles.deniedTitle}>Acceso restringido</Text>
          <Text style={styles.deniedText}>Solo administradores pueden ver usuarios.</Text>
          <Pressable style={styles.primaryButton} onPress={() => router.push('/home' as never)}>
            <Text style={styles.primaryButtonText}>Volver a Inicio</Text>
          </Pressable>
        </View>
      </KeyboardAwareScreen>
    );
  }

  return (
    <KeyboardAwareScreen style={{ backgroundColor: adminFormat.background }}>
      <View style={styles.hero}>
        <View style={styles.heroTop}>
          <View style={styles.iconBubble}>
            <MaterialCommunityIcons name="account-group" size={24} color={ucapsaBrand.colors.red} />
          </View>
          <Pressable style={styles.backButton} onPress={() => router.push('/admin-more' as never)}>
            <Text style={styles.backButtonText}>Mas</Text>
          </Pressable>
        </View>
        <Text style={styles.eyebrow}>Administracion</Text>
        <Text style={styles.title}>{filter === 'admins' ? 'Administradores' : 'Clientes'}</Text>
        <Text style={styles.subtitle}>{adminsOnly ? `${filteredProfiles.length} cuentas administrativas` : `${getFilterLabel(filter)} - ${filteredProfiles.length} registros`}</Text>
      </View>

      {!adminsOnly ? (
        <>
          <View style={styles.summaryGrid}>
            <Summary label="Todos" value={counts.clientsAndMembers} />
            <Summary label="Clientes" value={counts.clients} />
            <Summary label="Socios" value={counts.members} />
            <Summary label="Admins" value={counts.admins} />
          </View>

          <View style={styles.filterGrid}>
            {filterOptions.map((option) => {
              const active = filter === option.value;
              return (
                <Pressable key={option.value} style={[styles.filterChip, active && styles.filterChipActive]} onPress={() => setFilter(option.value)}>
                  <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>{option.label}</Text>
                  <Text style={[styles.filterChipHelper, active && styles.filterChipTextActive]}>{option.helper}</Text>
                </Pressable>
              );
            })}
          </View>
        </>
      ) : null}

      {loading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator color={ucapsaBrand.colors.red} />
          <Text style={styles.muted}>Cargando...</Text>
        </View>
      ) : null}

      {!loading && filteredProfiles.length === 0 ? (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyTitle}>Sin resultados</Text>
          <Text style={styles.muted}>Cambia el filtro para revisar otro grupo.</Text>
        </View>
      ) : null}

      <View style={styles.listCard}>
        {filteredProfiles.map((item) => (
          <Pressable
            key={item.id}
            style={styles.userRow}
            onPress={() => {
              if (item.role === 'client' || item.role === 'member') {
                router.push(`/admin/customer?userId=${encodeURIComponent(item.user_id)}` as never);
                return;
              }
              openUserDetail(item);
            }}
          >
            <View style={[styles.avatar, { backgroundColor: item.avatar_color || ucapsaBrand.colors.red }]}> 
              <Text style={styles.avatarText}>{(item.full_name || item.email || 'U').slice(0, 1).toUpperCase()}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.userName}>{item.full_name || 'Sin nombre'}</Text>
              <Text style={styles.userEmail}>{item.email || 'Sin correo'}</Text>
              <Text style={styles.userRole}>{getRoleLabel(item.role)}</Text>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={22} color={ucapsaBrand.colors.red} />
          </Pressable>
        ))}
      </View>

      <UserDetailModal
        profile={selectedProfile}
        saving={selectedProfile ? savingUserId === selectedProfile.user_id : false}
        onClose={() => setSelectedProfile(null)}
        onForceMember={handleForceMember}
        onBackToClient={handleBackToClient}
        achievements={selectedAchievements}
        loadingAchievements={loadingAchievements}
        onToggleAchievement={handleToggleAchievement}
      />
    </KeyboardAwareScreen>
  );
}

function Summary({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.summaryCard}>
      <Text style={styles.summaryValue}>{value}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
  );
}

function UserDetailModal({ profile, saving, onClose, onForceMember, onBackToClient, achievements, loadingAchievements, onToggleAchievement }: { profile: Profile | null; saving: boolean; onClose: () => void; onForceMember: (profile: Profile) => void; onBackToClient: (profile: Profile) => void; achievements: AchievementWithState[]; loadingAchievements: boolean; onToggleAchievement: (profile: Profile, item: AchievementWithState) => void }) {

  if (!profile) return null;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <KeyboardAwareScreen contentContainerStyle={styles.modalContent}>
          <Text style={styles.eyebrow}>Ficha de usuario</Text>
          <Text style={styles.modalTitle}>{profile.full_name || 'Sin nombre'}</Text>
          <Text style={styles.subtitle}>{getRoleLabel(profile.role)}</Text>

          <View style={styles.detailBox}>
            <Detail label="Nombre" value={profile.full_name} />
            <Detail label="Correo" value={profile.email} />
            <Detail label="Telefono" value={profile.phone} />
            <Detail label="Rol" value={getRoleLabel(profile.role)} />
            <Detail label="Solicitud eliminacion" value={profile.deletion_requested_at ? 'Si' : 'No'} />
          </View>

          {profile.role === 'client' || profile.role === 'member' ? (
            <>
              <View style={styles.achievementsAdminBox}>
                <View style={styles.achievementsHeaderRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.detailLabel}>Logros del cliente</Text>
                    <Text style={styles.achievementsAdminHint}>Marca manualmente programas ya completados. Tambien se otorgan solos al completar Puppy o Comandos.</Text>
                  </View>
                  {loadingAchievements ? <ActivityIndicator color={ucapsaBrand.colors.red} /> : null}
                </View>

                <View style={styles.achievementAdminGrid}>
                  {achievements.map((item) => (
                    <Pressable
                      key={item.definition.code}
                      disabled={saving || loadingAchievements}
                      style={[styles.achievementAdminChip, item.unlocked && styles.achievementAdminChipActive]}
                      onPress={() => onToggleAchievement(profile, item)}
                    >
                      <MaterialCommunityIcons name={item.definition.icon as never} size={22} color={item.unlocked ? '#7A1020' : ucapsaBrand.colors.muted} />
                      <View style={{ flex: 1 }}>
                            <Text style={[styles.achievementAdminTitle, item.unlocked && styles.achievementAdminTitleActive]}>{item.definition.title}</Text>
                            <Text style={[styles.achievementAdminStatus, item.unlocked && styles.achievementAdminStatusActive]}>{item.unlocked ? 'Completado' : 'Marcar completado'}</Text>
                      </View>
                    </Pressable>
                  ))}
                </View>
              </View>
            </>
          ) : null}

          {profile.role === 'client' || profile.role === 'member' ? (
            <Pressable
              style={styles.primaryButton}
              onPress={() => {
                onClose();
                router.push(`/admin/customer?userId=${encodeURIComponent(profile.user_id)}` as never);
              }}
            >
              <Text style={styles.primaryButtonText}>Ver cliente</Text>
            </Pressable>
          ) : null}

          {profile.role === 'member' ? (
            <Pressable style={styles.primaryButton} onPress={() => { onClose(); router.push(`/admin/customer-membership?userId=${encodeURIComponent(profile.user_id)}` as never); }}>
              <Text style={styles.primaryButtonText}>Abrir membresia</Text>
            </Pressable>
          ) : null}

          {profile.role === 'client' ? (
            <Pressable disabled={saving} style={styles.primaryButton} onPress={() => onForceMember(profile)}>
              <Text style={styles.primaryButtonText}>{saving ? 'Guardando...' : 'Forzar socio'}</Text>
            </Pressable>
          ) : null}

          {profile.role === 'member' ? (
            <Pressable disabled={saving} style={styles.secondaryButton} onPress={() => onBackToClient(profile)}>
              <Text style={styles.secondaryButtonText}>{saving ? 'Guardando...' : 'Volver a cliente'}</Text>
            </Pressable>
          ) : null}

          <Pressable style={styles.closeButton} onPress={onClose}>
            <Text style={styles.closeButtonText}>Cerrar</Text>
          </Pressable>
        </KeyboardAwareScreen>
      </View>
    </Modal>
  );
}

function Detail({ label, value }: { label: string; value?: string | null }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text selectable style={styles.detailValue}>{value || 'Sin dato'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  deniedBox: { flex: 1, minHeight: 420, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  deniedTitle: { color: ucapsaBrand.colors.redDark, fontSize: 24, fontWeight: '900', textAlign: 'center' },
  deniedText: { color: ucapsaBrand.colors.muted, fontSize: 14, lineHeight: 20, textAlign: 'center', fontWeight: '700' },
  hero: { backgroundColor: '#fff', borderRadius: 30, borderWidth: 1, borderColor: ucapsaBrand.colors.border, padding: 20 },
  heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  iconBubble: { width: 46, height: 46, borderRadius: 23, backgroundColor: ucapsaBrand.colors.redSoft, alignItems: 'center', justifyContent: 'center' },
  backButton: { backgroundColor: ucapsaBrand.colors.redSoft, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 9 },
  backButtonText: { color: ucapsaBrand.colors.redDark, fontWeight: '900' },
  eyebrow: { color: ucapsaBrand.colors.red, fontSize: 12, fontWeight: '900', letterSpacing: 0.7, textTransform: 'uppercase' },
  title: { color: ucapsaBrand.colors.text, fontSize: 30, fontWeight: '900', marginTop: 4 },
  subtitle: { color: ucapsaBrand.colors.muted, fontSize: 14, fontWeight: '800', marginTop: 6 },
  summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  summaryCard: { width: '48%', backgroundColor: '#fff', borderRadius: 20, borderWidth: 1, borderColor: ucapsaBrand.colors.border, padding: 14 },
  summaryValue: { color: ucapsaBrand.colors.red, fontSize: 26, fontWeight: '900' },
  summaryLabel: { color: ucapsaBrand.colors.muted, fontSize: 12, fontWeight: '900', marginTop: 4 },
  filterGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  filterChip: { width: '48%', backgroundColor: '#fff', borderRadius: 18, borderWidth: 1, borderColor: ucapsaBrand.colors.border, padding: 12 },
  filterChipActive: { backgroundColor: ucapsaBrand.colors.red, borderColor: ucapsaBrand.colors.red },
  filterChipText: { color: ucapsaBrand.colors.text, fontSize: 13, fontWeight: '900' },
  filterChipHelper: { color: ucapsaBrand.colors.muted, fontSize: 11, fontWeight: '700', marginTop: 3 },
  filterChipTextActive: { color: '#fff' },
  loadingBox: { alignItems: 'center', gap: 8, padding: 20 },
  muted: { color: ucapsaBrand.colors.muted, fontSize: 14, lineHeight: 20 },
  emptyBox: { backgroundColor: '#fff', borderWidth: 1, borderColor: ucapsaBrand.colors.border, borderRadius: 22, padding: 16 },
  emptyTitle: { color: ucapsaBrand.colors.text, fontSize: 16, fontWeight: '900' },
  listCard: { backgroundColor: '#fff', borderRadius: 24, borderWidth: 1, borderColor: ucapsaBrand.colors.border, overflow: 'hidden' },
  userRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderBottomWidth: 1, borderBottomColor: '#F6E6E9' },
  avatar: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontSize: 20, fontWeight: '900' },
  userName: { color: ucapsaBrand.colors.text, fontSize: 16, fontWeight: '900' },
  userEmail: { color: ucapsaBrand.colors.muted, fontSize: 13, marginTop: 2 },
  userRole: { color: ucapsaBrand.colors.red, fontSize: 12, fontWeight: '900', marginTop: 4 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(37, 21, 26, 0.35)' },
  modalContent: { backgroundColor: ucapsaBrand.colors.background, marginTop: 40, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingBottom: 40 },
  modalTitle: { color: ucapsaBrand.colors.text, fontSize: 28, fontWeight: '900', marginTop: 4 },
  detailBox: { backgroundColor: '#fff', borderRadius: 22, padding: 14, borderWidth: 1, borderColor: ucapsaBrand.colors.border, marginTop: 14 },
  detailRow: { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#F7E6EA' },
  detailLabel: { color: ucapsaBrand.colors.muted, fontSize: 12, fontWeight: '900', textTransform: 'uppercase' },
  detailValue: { color: ucapsaBrand.colors.text, fontSize: 14, fontWeight: '700', marginTop: 3 },
  achievementsAdminBox: { gap: 12, backgroundColor: '#fff', borderRadius: 22, padding: 14, borderWidth: 1, borderColor: ucapsaBrand.colors.border, marginTop: 14 },
  achievementsHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  achievementsAdminHint: { color: ucapsaBrand.colors.muted, fontSize: 12, lineHeight: 18, fontWeight: '700', marginTop: 4 },
  achievementAdminGrid: { gap: 8 },
  achievementAdminChip: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 18, backgroundColor: ucapsaBrand.colors.background, borderWidth: 1, borderColor: ucapsaBrand.colors.border },
  achievementAdminChipActive: { backgroundColor: '#FFF7CC', borderColor: '#FACC15' },
  achievementAdminTitle: { color: ucapsaBrand.colors.text, fontSize: 14, fontWeight: '900' },
  achievementAdminTitleActive: { color: '#7A1020' },
  achievementAdminStatus: { color: ucapsaBrand.colors.muted, fontSize: 12, fontWeight: '800', marginTop: 2 },
  achievementAdminStatusActive: { color: '#92400E' },
  primaryButton: { backgroundColor: ucapsaBrand.colors.red, borderRadius: 16, paddingVertical: 14, alignItems: 'center', marginTop: 16 },
  primaryButtonText: { color: '#fff', fontSize: 14, fontWeight: '900' },
  secondaryButton: { backgroundColor: '#fff', borderWidth: 1, borderColor: ucapsaBrand.colors.border, borderRadius: 16, paddingVertical: 14, alignItems: 'center', marginTop: 12 },
  secondaryButtonText: { color: ucapsaBrand.colors.redDark, fontSize: 14, fontWeight: '900' },
  closeButton: { backgroundColor: ucapsaBrand.colors.text, borderRadius: 16, paddingVertical: 14, alignItems: 'center', marginTop: 12 },
  closeButtonText: { color: '#fff', fontSize: 14, fontWeight: '900' },
});

