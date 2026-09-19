import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { KeyboardAwareScreen } from '../../components/ui/KeyboardAwareScreen';
import { ucapsaBrand, withAlpha } from '../../constants/brand';
import { resolveUcapsaFormat } from '../../constants/ucapsaFormats';
import { useSession } from '../../hooks/useSession';
import { getAdminProfiles } from '../../services/profiles.service';
import type { AppRole, Profile } from '../../types/app.types';

type UserFilter = 'clients_and_members' | 'clients' | 'members' | 'admins';

const filterOptions: Array<{ value: UserFilter; label: string; helper: string }> = [
  { value: 'clients_and_members', label: 'Todos', helper: 'Clientes y socios' },
  { value: 'clients', label: 'Clientes', helper: 'Sin rol de socio' },
  { value: 'members', label: 'Socios', helper: 'Con membresía' },
  { value: 'admins', label: 'Admins', helper: 'Administración' },
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

function isCustomer(profile: Profile) {
  return profile.role === 'client' || profile.role === 'member';
}

export default function AdminUsersScreen() {
  const { user, role } = useSession();
  const adminFormat = useMemo(
    () => resolveUcapsaFormat({ user, role, isAdmin: true }),
    [user, role],
  );
  const params = useLocalSearchParams<{ filter?: string; userId?: string }>();
  const adminsOnly = params.filter === 'admins';

  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [filter, setFilter] = useState<UserFilter>(adminsOnly ? 'admins' : 'clients_and_members');
  const [loading, setLoading] = useState(true);
  const [selectedAdmin, setSelectedAdmin] = useState<Profile | null>(null);
  const handledRouteUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (
      typeof params.filter === 'string'
      && filterOptions.some((item) => item.value === params.filter)
    ) {
      setFilter(params.filter as UserFilter);
    }
  }, [params.filter]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    void getAdminProfiles()
      .then((rows) => {
        if (active) setProfiles(rows);
      })
      .catch((error) => {
        if (active) {
          Alert.alert(
            'No se pudieron cargar usuarios',
            error instanceof Error ? error.message : 'Intenta de nuevo.',
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const routeUserId = typeof params.userId === 'string' ? params.userId.trim() : '';
    if (
      !routeUserId
      || profiles.length === 0
      || handledRouteUserIdRef.current === routeUserId
    ) {
      return;
    }

    const profile = profiles.find((item) => item.user_id === routeUserId);
    if (!profile) return;

    handledRouteUserIdRef.current = routeUserId;
    if (isCustomer(profile)) {
      router.replace(`/admin/customer?userId=${encodeURIComponent(profile.user_id)}` as never);
      return;
    }
    setSelectedAdmin(profile);
  }, [params.userId, profiles]);

  const filteredProfiles = useMemo(
    () => profiles.filter((profile) => matchesFilter(profile, filter)),
    [profiles, filter],
  );

  const counts = useMemo(() => ({
    clientsAndMembers: profiles.filter((profile) => isCustomer(profile)).length,
    clients: profiles.filter((profile) => profile.role === 'client').length,
    members: profiles.filter((profile) => profile.role === 'member').length,
    admins: profiles.filter(
      (profile) => profile.role === 'admin' || profile.role === 'super_admin',
    ).length,
  }), [profiles]);

  function openProfile(profile: Profile) {
    if (isCustomer(profile)) {
      router.push(`/admin/customer?userId=${encodeURIComponent(profile.user_id)}` as never);
      return;
    }
    setSelectedAdmin(profile);
  }

  return (
    <KeyboardAwareScreen style={{ backgroundColor: adminFormat.background }}>
      <View style={styles.hero}>
        <View style={styles.heroTop}>
          <View style={styles.iconBubble}>
            <MaterialCommunityIcons name="account-group" size={24} color={ucapsaBrand.colors.red} />
          </View>
          <Pressable style={styles.backButton} onPress={() => router.push('/admin-more' as never)}>
            <Text style={styles.backButtonText}>Más</Text>
          </Pressable>
        </View>
        <Text style={styles.eyebrow}>Administración</Text>
        <Text style={styles.title}>{adminsOnly ? 'Administradores' : 'Usuarios'}</Text>
        <Text style={styles.subtitle}>
          {adminsOnly
            ? `${filteredProfiles.length} cuentas administrativas`
            : `${getFilterLabel(filter)} · ${filteredProfiles.length} registros`}
        </Text>
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
                <Pressable
                  key={option.value}
                  style={[styles.filterChip, active && styles.filterChipActive]}
                  onPress={() => setFilter(option.value)}
                >
                  <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                    {option.label}
                  </Text>
                  <Text style={[styles.filterChipHelper, active && styles.filterChipTextActive]}>
                    {option.helper}
                  </Text>
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
            onPress={() => openProfile(item)}
          >
            <View style={[styles.avatar, { backgroundColor: item.avatar_color || ucapsaBrand.colors.red }]}>
              <Text style={styles.avatarText}>
                {(item.full_name || item.email || 'U').slice(0, 1).toUpperCase()}
              </Text>
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

      <AdminAccountDetailModal
        profile={selectedAdmin}
        onClose={() => setSelectedAdmin(null)}
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

function AdminAccountDetailModal({
  profile,
  onClose,
}: {
  profile: Profile | null;
  onClose: () => void;
}) {
  if (!profile) return null;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <KeyboardAwareScreen contentContainerStyle={styles.modalContent}>
          <Text style={styles.eyebrow}>Cuenta administrativa</Text>
          <Text style={styles.modalTitle}>{profile.full_name || 'Sin nombre'}</Text>
          <Text style={styles.subtitle}>{getRoleLabel(profile.role)}</Text>

          <View style={styles.detailBox}>
            <Detail label="Nombre" value={profile.full_name} />
            <Detail label="Correo" value={profile.email} />
            <Detail label="Teléfono" value={profile.phone} />
            <Detail label="Rol" value={getRoleLabel(profile.role)} />
          </View>

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
  hero: { backgroundColor: ucapsaBrand.colors.surface, borderRadius: 30, borderWidth: 1, borderColor: ucapsaBrand.colors.border, padding: 20 },
  heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  iconBubble: { width: 46, height: 46, borderRadius: 23, backgroundColor: ucapsaBrand.colors.redSoft, alignItems: 'center', justifyContent: 'center' },
  backButton: { backgroundColor: ucapsaBrand.colors.redSoft, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 9 },
  backButtonText: { color: ucapsaBrand.colors.redDark, fontWeight: '900' },
  eyebrow: { color: ucapsaBrand.colors.red, fontSize: 12, fontWeight: '900', letterSpacing: 0.7, textTransform: 'uppercase' },
  title: { color: ucapsaBrand.colors.text, fontSize: 30, fontWeight: '900', marginTop: 4 },
  subtitle: { color: ucapsaBrand.colors.muted, fontSize: 14, fontWeight: '800', marginTop: 6 },
  summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  summaryCard: { width: '48%', backgroundColor: ucapsaBrand.colors.surface, borderRadius: 20, borderWidth: 1, borderColor: ucapsaBrand.colors.border, padding: 14 },
  summaryValue: { color: ucapsaBrand.colors.red, fontSize: 26, fontWeight: '900' },
  summaryLabel: { color: ucapsaBrand.colors.muted, fontSize: 12, fontWeight: '900', marginTop: 4 },
  filterGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  filterChip: { width: '48%', backgroundColor: ucapsaBrand.colors.surface, borderRadius: 18, borderWidth: 1, borderColor: ucapsaBrand.colors.border, padding: 12 },
  filterChipActive: { backgroundColor: ucapsaBrand.colors.red, borderColor: ucapsaBrand.colors.red },
  filterChipText: { color: ucapsaBrand.colors.text, fontSize: 13, fontWeight: '900' },
  filterChipHelper: { color: ucapsaBrand.colors.muted, fontSize: 11, fontWeight: '700', marginTop: 3 },
  filterChipTextActive: { color: ucapsaBrand.colors.surface },
  loadingBox: { alignItems: 'center', gap: 8, padding: 20 },
  muted: { color: ucapsaBrand.colors.muted, fontSize: 14, lineHeight: 20 },
  emptyBox: { backgroundColor: ucapsaBrand.colors.surface, borderWidth: 1, borderColor: ucapsaBrand.colors.border, borderRadius: 22, padding: 16 },
  emptyTitle: { color: ucapsaBrand.colors.text, fontSize: 16, fontWeight: '900' },
  listCard: { backgroundColor: ucapsaBrand.colors.surface, borderRadius: 24, borderWidth: 1, borderColor: ucapsaBrand.colors.border, overflow: 'hidden' },
  userRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderBottomWidth: 1, borderBottomColor: ucapsaBrand.colors.redSoft },
  avatar: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: ucapsaBrand.colors.surface, fontSize: 20, fontWeight: '900' },
  userName: { color: ucapsaBrand.colors.text, fontSize: 16, fontWeight: '900' },
  userEmail: { color: ucapsaBrand.colors.muted, fontSize: 13, marginTop: 2 },
  userRole: { color: ucapsaBrand.colors.red, fontSize: 12, fontWeight: '900', marginTop: 4 },
  modalBackdrop: { flex: 1, backgroundColor: withAlpha(ucapsaBrand.colors.text, 0.35) },
  modalContent: { backgroundColor: ucapsaBrand.colors.background, marginTop: 40, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingBottom: 40 },
  modalTitle: { color: ucapsaBrand.colors.text, fontSize: 28, fontWeight: '900', marginTop: 4 },
  detailBox: { backgroundColor: ucapsaBrand.colors.surface, borderRadius: 22, padding: 14, borderWidth: 1, borderColor: ucapsaBrand.colors.border, marginTop: 14 },
  detailRow: { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: ucapsaBrand.colors.redSoft },
  detailLabel: { color: ucapsaBrand.colors.muted, fontSize: 12, fontWeight: '900', textTransform: 'uppercase' },
  detailValue: { color: ucapsaBrand.colors.text, fontSize: 14, fontWeight: '700', marginTop: 3 },
  closeButton: { backgroundColor: ucapsaBrand.colors.text, borderRadius: 16, paddingVertical: 14, alignItems: 'center', marginTop: 12 },
  closeButtonText: { color: ucapsaBrand.colors.surface, fontSize: 14, fontWeight: '900' },
});
