import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { KeyboardAwareScreen } from '../../components/ui/KeyboardAwareScreen';
import { ucapsaBrand, withAlpha } from '../../constants/brand';
import { preregistrationDirectoryEnabled, preregistrationEnabled } from '../../constants/preregistrationFeature';
import { resolveUcapsaFormat } from '../../constants/ucapsaFormats';
import { useSession } from '../../hooks/useSession';
import { getAdminProfiles, setStaffRoleSuperAdmin } from '../../services/profiles.service';
import { getAdminActiveMembershipUserIds } from '../../services/memberships-admin.service';
import { directoryStatusLabel, getDirectoryCounts, matchesDirectoryFilter } from '../../services/admin-directory-classification.domain';
import type { AppRole, Profile } from '../../types/app.types';

type UserFilter = 'clients_and_members' | 'clients' | 'members' | 'admins';

const filterOptions: Array<{ value: UserFilter; label: string; helper: string }> = [
  { value: 'clients_and_members', label: 'Todos', helper: 'Todas las personas registradas' },
  { value: 'clients', label: 'Clientes', helper: 'Sin membresía activa ni rol de staff' },
  { value: 'members', label: 'Socios', helper: 'Membresía activa, incluso si son staff' },
  { value: 'admins', label: 'Staff', helper: 'Entrenadores y administración' },
];

function getRoleLabel(role: AppRole) {
  if (role === 'super_admin') return 'Super admin';
  if (role === 'admin') return 'Admin';
  if (role === 'trainer') return 'Entrenador';
  if (role === 'member') return 'Socio';
  return 'Cliente';
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
  const [activeMemberIds, setActiveMemberIds] = useState<ReadonlySet<string>>(new Set());
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
    void Promise.all([getAdminProfiles(), getAdminActiveMembershipUserIds()])
      .then(([rows, memberUserIds]) => {
        if (active) {
          setProfiles(rows);
          setActiveMemberIds(new Set(memberUserIds));
        }
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
    () => profiles.filter((profile) => matchesDirectoryFilter(profile, filter, activeMemberIds)),
    [profiles, filter, activeMemberIds],
  );

  const counts = useMemo(() => getDirectoryCounts(profiles, activeMemberIds), [profiles, activeMemberIds]);

  function openProfile(profile: Profile) {
    if (isCustomer(profile)) {
      router.push(`/admin/customer?userId=${encodeURIComponent(profile.user_id)}` as never);
      return;
    }
    setSelectedAdmin(profile);
  }

  async function changeStaffRole(profile: Profile, nextRole: Extract<AppRole, 'client' | 'trainer' | 'admin'>) {
    try {
      await setStaffRoleSuperAdmin(profile.user_id, nextRole);
      const [nextProfiles, memberUserIds] = await Promise.all([
        getAdminProfiles(), getAdminActiveMembershipUserIds(),
      ]);
      setProfiles(nextProfiles);
      setActiveMemberIds(new Set(memberUserIds));
      setSelectedAdmin(nextProfiles.find((item) => item.user_id === profile.user_id) ?? null);
    } catch (cause) {
      Alert.alert('No se pudo cambiar el rol', cause instanceof Error ? cause.message : 'Intenta de nuevo.');
      throw cause;
    }
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
          {preregistrationEnabled ? (
            <Pressable accessibilityRole="button"
              accessibilityLabel="Abrir preinscripciones"
              onPress={() => router.push(
                (preregistrationDirectoryEnabled ? '/admin/preregistrations' : '/admin/preregister-dog') as never
              )}
              style={styles.preregisterAction}>
              <MaterialCommunityIcons name="dog" size={21} color={ucapsaBrand.colors.redDark} />
              <Text style={styles.preregisterActionText}>{preregistrationDirectoryEnabled ? 'Ver preinscripciones' : 'Registrar perro sin cuenta'}</Text>
              <MaterialCommunityIcons name="chevron-right" size={20} color={ucapsaBrand.colors.redDark} />
            </Pressable>
          ) : null}
          <View style={styles.summaryGrid}>
            <Summary label="Todos" value={counts.total} />
            <Summary label="Clientes" value={counts.clients} />
            <Summary label="Socios" value={counts.members} />
            <Summary label="Staff" value={counts.staff} />
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
              <Text style={styles.userRole}>{directoryStatusLabel(item, activeMemberIds)}</Text>
            </View>
            {role === 'super_admin' && item.role !== 'super_admin' ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Gestionar rol de ${item.full_name || item.email || 'usuario'}`}
                style={styles.roleButton}
                onPress={(event) => {
                  event.stopPropagation();
                  setSelectedAdmin(item);
                }}
              >
                <MaterialCommunityIcons name="shield-account-outline" size={20} color={ucapsaBrand.colors.purpleDark} />
              </Pressable>
            ) : null}
            <MaterialCommunityIcons name="chevron-right" size={22} color={ucapsaBrand.colors.red} />
          </Pressable>
        ))}
      </View>

      <AdminAccountDetailModal
        profile={selectedAdmin}
        canManageRoles={role === 'super_admin'}
        onRoleChange={changeStaffRole}
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
  canManageRoles,
  onRoleChange,
  onClose,
}: {
  profile: Profile | null;
  canManageRoles: boolean;
  onRoleChange: (profile: Profile, role: Extract<AppRole, 'client' | 'trainer' | 'admin'>) => Promise<void>;
  onClose: () => void;
}) {
  const [savingRole, setSavingRole] = useState(false);
  if (!profile) return null;

  const canEditThisRole = canManageRoles && profile.role !== 'super_admin';

  async function setRole(nextRole: Extract<AppRole, 'client' | 'trainer' | 'admin'>) {
    if (!profile || savingRole || !canEditThisRole || profile.role === nextRole) return;
    Alert.alert(
      'Cambiar rol',
      nextRole === 'trainer'
        ? 'Esta cuenta verá únicamente las herramientas operativas de Entrenador.'
        : nextRole === 'admin'
          ? 'Esta cuenta tendrá acceso administrativo completo.'
          : 'Esta cuenta volverá a la experiencia de cliente.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Confirmar',
          onPress: async () => {
            try {
              setSavingRole(true);
              await onRoleChange(profile, nextRole);
            } finally {
              setSavingRole(false);
            }
          },
        },
      ],
    );
  }

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <KeyboardAwareScreen contentContainerStyle={styles.modalContent}>
          <Text style={styles.eyebrow}>Cuenta administrativa</Text>
          <Text style={styles.modalTitle}>{profile.full_name || 'Sin nombre'}</Text>
          <Text style={styles.subtitle}>{getRoleLabel(profile.role)} · acceso operativo</Text>

          <View style={styles.detailBox}>
            <Detail label="Nombre" value={profile.full_name} />
            <Detail label="Correo" value={profile.email} />
            <Detail label="Teléfono" value={profile.phone} />
            <Detail label="Rol" value={getRoleLabel(profile.role)} />
          </View>

          {canManageRoles ? (
            <View style={styles.roleManager}>
              <Text style={styles.roleManagerTitle}>Acceso del equipo</Text>
              {profile.role === 'super_admin' ? (
                <Text style={styles.roleManagerHint}>Las cuentas Superadmin no se modifican desde esta pantalla.</Text>
              ) : (
                <>
                  <Text style={styles.roleManagerHint}>Estos permisos son independientes de la membresía de Socio y las tarjetas Puppy/Comandos. Cambiar el acceso operativo no altera pagos, inscripciones ni la membresía.</Text>
                  <Text style={styles.roleManagerHint}>Entrenador administra clases y exámenes; Admin gestiona UCAPSA. Superadmin conserva control exclusivo de cambios de rol.</Text>
                  <View style={styles.roleOptions}>
                    {([
                      { value: 'client', label: 'Cliente' },
                      { value: 'trainer', label: 'Entrenador' },
                      { value: 'admin', label: 'Admin' },
                    ] as const).map((option) => (
                      <Pressable
                        key={option.value}
                        disabled={savingRole}
                        style={[styles.roleOption, profile.role === option.value && styles.roleOptionActive]}
                        onPress={() => void setRole(option.value)}
                      >
                        <Text style={[styles.roleOptionText, profile.role === option.value && styles.roleOptionTextActive]}>{option.label}</Text>
                      </Pressable>
                    ))}
                  </View>
                </>
              )}
            </View>
          ) : null}

          {canManageRoles ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Gestionar membresía de Socio por separado"
              style={styles.roleOption}
              onPress={() => {
                onClose();
                router.push(('/admin/customer-membership?userId=' + encodeURIComponent(profile.user_id)) as never);
              }}
            >
              <Text style={styles.roleOptionText}>Membresía de Socio · gestión separada</Text>
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
  preregisterAction: { marginHorizontal: 16, marginBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: 14, backgroundColor: ucapsaBrand.colors.surface, borderWidth: 1, borderColor: ucapsaBrand.colors.border },
  preregisterActionText: { flex: 1, color: ucapsaBrand.colors.text, fontWeight: '800', fontSize: 14 },
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
  roleButton: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: ucapsaBrand.colors.purpleSoft },
  modalBackdrop: { flex: 1, backgroundColor: withAlpha(ucapsaBrand.colors.text, 0.35) },
  modalContent: { backgroundColor: ucapsaBrand.colors.background, marginTop: 40, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingBottom: 40 },
  modalTitle: { color: ucapsaBrand.colors.text, fontSize: 28, fontWeight: '900', marginTop: 4 },
  detailBox: { backgroundColor: ucapsaBrand.colors.surface, borderRadius: 22, padding: 14, borderWidth: 1, borderColor: ucapsaBrand.colors.border, marginTop: 14 },
  detailRow: { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: ucapsaBrand.colors.redSoft },
  detailLabel: { color: ucapsaBrand.colors.muted, fontSize: 12, fontWeight: '900', textTransform: 'uppercase' },
  detailValue: { color: ucapsaBrand.colors.text, fontSize: 14, fontWeight: '700', marginTop: 3 },
  roleManager: { gap: 8, borderRadius: 18, borderWidth: 1, borderColor: ucapsaBrand.colors.purple, backgroundColor: ucapsaBrand.colors.purpleSoft, padding: 12, marginTop: 12 },
  roleManagerTitle: { color: ucapsaBrand.colors.purpleDark, fontSize: 13, fontWeight: '900' },
  roleManagerHint: { color: ucapsaBrand.colors.purpleDark, fontSize: 10, lineHeight: 15, fontWeight: '700' },
  roleOptions: { flexDirection: 'row', gap: 7, flexWrap: 'wrap' },
  roleOption: { minHeight: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 12, borderWidth: 1, borderColor: ucapsaBrand.colors.purple, backgroundColor: ucapsaBrand.colors.surface, paddingHorizontal: 11 },
  roleOptionActive: { backgroundColor: ucapsaBrand.colors.purple, borderColor: ucapsaBrand.colors.purple },
  roleOptionText: { color: ucapsaBrand.colors.purpleDark, fontSize: 10, fontWeight: '900' },
  roleOptionTextActive: { color: ucapsaBrand.colors.surface },
  closeButton: { backgroundColor: ucapsaBrand.colors.text, borderRadius: 16, paddingVertical: 14, alignItems: 'center', marginTop: 12 },
  closeButtonText: { color: ucapsaBrand.colors.surface, fontSize: 14, fontWeight: '900' },
});
