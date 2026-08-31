import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Redirect, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';

import { KeyboardAwareScreen } from '../../components/ui/KeyboardAwareScreen';
import { ucapsaBrand } from '../../constants/brand';
import { useSession } from '../../hooks/useSession';
import { supabase } from '../../lib/supabase';
import type { Profile } from '../../types/app.types';
import { DEFAULT_READ_TIMEOUT_MS, friendlyReadError, withOperationTimeout } from '../../utils/async.utils';

type ClientFilter = 'all' | 'members' | 'clients';
type ClientIntent = 'default' | 'attendance' | 'payments';

function labelForRole(role: Profile['role']) {
  return role === 'member' ? 'Socio' : 'Cliente';
}

export default function AdminClientsTab() {
  const { isAdmin } = useSession();
  const params = useLocalSearchParams<{ intent?: string }>();
  const intent: ClientIntent = params.intent === 'attendance' ? 'attendance' : params.intent === 'payments' ? 'payments' : 'default';
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [dogNamesByUser, setDogNamesByUser] = useState<Record<string, string[]>>({});
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<ClientFilter>('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasData, setHasData] = useState(false);

  const load = useCallback(async () => {
    if (!isAdmin) return;
    setError(null);
    const result = await withOperationTimeout((async () => {
      const { data, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .in('role', ['client', 'member'])
        .order('full_name', { ascending: true, nullsFirst: false });
      if (profileError) throw profileError;
      const profileRows = (data ?? []) as Profile[];
      const userIds = profileRows.map((item) => item.user_id).filter(Boolean);
      if (userIds.length === 0) return { profileRows, nextDogNames: {} as Record<string, string[]> };

      const { data: dogRows, error: dogError } = await supabase
        .from('dogs')
        .select('user_id,name')
        .in('user_id', userIds)
        .eq('is_active', true)
        .order('created_at', { ascending: true });
      if (dogError) throw dogError;

      const nextDogNames: Record<string, string[]> = {};
      for (const row of (dogRows ?? []) as Array<{ user_id: string; name: string }>) {
        nextDogNames[row.user_id] = nextDogNames[row.user_id] ?? [];
        if (!nextDogNames[row.user_id].includes(row.name)) nextDogNames[row.user_id].push(row.name);
      }
      return { profileRows, nextDogNames };
    })(), DEFAULT_READ_TIMEOUT_MS, 'admin-clients-load');

    setProfiles(result.profileRows);
    setDogNamesByUser(result.nextDogNames);
    setHasData(true);
  }, [isAdmin]);

  useFocusEffect(useCallback(() => {
    if (!isAdmin) return undefined;
    setLoading(true);
    void load().catch(() => setError(friendlyReadError('No se pudo cargar la lista de clientes.'))).finally(() => setLoading(false));
    return undefined;
  }, [isAdmin, load]));

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return profiles.filter((profile) => {
      if (filter === 'members' && profile.role !== 'member') return false;
      if (filter === 'clients' && profile.role !== 'client') return false;
      if (!needle) return true;
      return [profile.full_name, profile.email, profile.phone, ...(dogNamesByUser[profile.user_id] ?? [])].filter(Boolean).some((value) => String(value).toLowerCase().includes(needle));
    });
  }, [dogNamesByUser, filter, profiles, search]);

  async function refresh() {
    setRefreshing(true);
    try { await load(); } catch { setError(friendlyReadError('No se pudo cargar la lista de clientes.')); } finally { setRefreshing(false); }
  }

  function openClient(profile: Profile) {
    const encoded = encodeURIComponent(profile.user_id);
    if (intent === 'attendance') {
      router.push(`/admin/customer-attendance?userId=${encoded}` as never);
      return;
    }
    if (intent === 'payments') {
      router.push(`/admin/customer-payments?userId=${encoded}` as never);
      return;
    }
    router.push(`/admin/customer?userId=${encoded}` as never);
  }

  if (!isAdmin) return <Redirect href="/home" />;

  const title = intent === 'attendance' ? 'Registrar asistencia' : intent === 'payments' ? 'Registrar pago' : 'Clientes';
  const subtitle = intent === 'attendance'
    ? 'Elige un cliente y abre directamente sus asistencias.'
    : intent === 'payments'
      ? 'Elige un cliente y abre directamente sus pagos.'
      : 'Busca una persona y abre su informacion.';

  return (
    <KeyboardAwareScreen refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={ucapsaBrand.colors.red} />}>
      <View style={styles.header}>
        <Text style={styles.kicker}>Admin</Text>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
      </View>

      {intent !== 'default' ? (
        <Pressable style={styles.intentBanner} onPress={() => router.replace('/admin-clients' as never)}>
          <MaterialIcons name={intent === 'attendance' ? 'fact-check' : 'payments'} size={20} color={ucapsaBrand.colors.redDark} />
          <Text style={styles.intentText}>{intent === 'attendance' ? 'Modo asistencia manual' : 'Modo registro de pago'}</Text>
          <Text style={styles.intentClose}>Salir</Text>
        </Pressable>
      ) : null}

      <TextInput value={search} onChangeText={setSearch} placeholder="Buscar nombre, correo, telefono o perro" style={styles.search} />

      <View style={styles.filters}>
        <Filter label="Todos" active={filter === 'all'} onPress={() => setFilter('all')} />
        <Filter label="Socios" active={filter === 'members'} onPress={() => setFilter('members')} />
        <Filter label="Clientes" active={filter === 'clients'} onPress={() => setFilter('clients')} />
      </View>

      {hasData ? <Text style={styles.count}>{rows.length} resultados</Text> : null}
      {loading ? <View style={styles.loading}><ActivityIndicator color={ucapsaBrand.colors.red} /><Text style={styles.muted}>Cargando clientes...</Text></View> : null}
      {error ? <View style={styles.errorBox}><Text style={styles.errorTitle}>No se pudo actualizar</Text><Text style={styles.muted}>{error}</Text><Pressable style={styles.retryButton} onPress={() => void refresh()}><Text style={styles.retryText}>Reintentar</Text></Pressable></View> : null}
      {!loading && hasData && rows.length === 0 ? <View style={styles.empty}><MaterialIcons name="person-search" size={32} color={ucapsaBrand.colors.redDark} /><Text style={styles.emptyTitle}>Sin resultados</Text><Text style={styles.muted}>Prueba otro nombre o filtro.</Text></View> : null}

      <View style={styles.list}>
        {rows.map((profile, index) => (
          <Pressable key={profile.id} style={[styles.row, index === rows.length - 1 && styles.rowLast]} onPress={() => openClient(profile)}>
            <View style={[styles.avatar, { backgroundColor: profile.avatar_color || ucapsaBrand.colors.red }]}><Text style={styles.avatarText}>{(profile.full_name || profile.email || 'U').slice(0, 1).toUpperCase()}</Text></View>
            <View style={{ flex: 1 }}><Text style={styles.name}>{profile.full_name || 'Sin nombre'}</Text><Text style={styles.meta}>{profile.email || profile.phone || 'Sin contacto'}</Text>{(dogNamesByUser[profile.user_id] ?? []).length > 0 ? <Text style={styles.dogs}>Perros: {(dogNamesByUser[profile.user_id] ?? []).join(', ')}</Text> : null}<Text style={styles.role}>{labelForRole(profile.role)}</Text></View>
            <MaterialIcons name="chevron-right" size={24} color={ucapsaBrand.colors.redDark} />
          </Pressable>
        ))}
      </View>
    </KeyboardAwareScreen>
  );
}

function Filter({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return <Pressable style={[styles.filter, active && styles.filterActive]} onPress={onPress}><Text style={[styles.filterText, active && styles.filterTextActive]}>{label}</Text></Pressable>;
}

const styles = StyleSheet.create({
  header: { marginBottom: 14 },
  kicker: { color: ucapsaBrand.colors.redDark, fontSize: 12, fontWeight: '900', textTransform: 'uppercase' },
  title: { color: ucapsaBrand.colors.text, fontSize: 30, fontWeight: '900' },
  subtitle: { color: ucapsaBrand.colors.muted, fontSize: 13, lineHeight: 19, fontWeight: '700', marginTop: 3 },
  intentBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 15, backgroundColor: ucapsaBrand.colors.redSoft, padding: 11, marginBottom: 10 },
  intentText: { flex: 1, color: ucapsaBrand.colors.redDark, fontSize: 12, fontWeight: '900' },
  intentClose: { color: ucapsaBrand.colors.redDark, fontSize: 11, fontWeight: '900' },
  search: { backgroundColor: ucapsaBrand.colors.surface, borderWidth: 1, borderColor: ucapsaBrand.colors.border, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 12, color: ucapsaBrand.colors.text, fontSize: 14, marginBottom: 10 },
  filters: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  filter: { flex: 1, alignItems: 'center', borderRadius: 14, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, paddingVertical: 10 },
  filterActive: { backgroundColor: ucapsaBrand.colors.red, borderColor: ucapsaBrand.colors.red },
  filterText: { color: ucapsaBrand.colors.text, fontSize: 12, fontWeight: '900' },
  filterTextActive: { color: ucapsaBrand.colors.surface },
  count: { color: ucapsaBrand.colors.muted, fontSize: 12, fontWeight: '800', marginBottom: 10 },
  loading: { flexDirection: 'row', gap: 10, alignItems: 'center', paddingVertical: 14 },
  muted: { color: ucapsaBrand.colors.muted, fontSize: 13, fontWeight: '700' },
  errorBox: { borderRadius: 18, borderWidth: 1, borderColor: ucapsaBrand.colors.dangerBorder, backgroundColor: ucapsaBrand.colors.dangerSoft, padding: 14, gap: 6, marginBottom: 12 },
  errorTitle: { color: ucapsaBrand.colors.danger, fontSize: 15, fontWeight: '900' },
  retryButton: { alignSelf: 'flex-start', borderRadius: 12, backgroundColor: ucapsaBrand.colors.red, paddingHorizontal: 13, paddingVertical: 9 },
  retryText: { color: ucapsaBrand.colors.surface, fontSize: 12, fontWeight: '900' },
  empty: { alignItems: 'center', gap: 7, paddingVertical: 32 },
  emptyTitle: { color: ucapsaBrand.colors.text, fontSize: 18, fontWeight: '900' },
  list: { borderRadius: 20, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderBottomWidth: 1, borderBottomColor: ucapsaBrand.colors.premiumMuted },
  rowLast: { borderBottomWidth: 0 },
  avatar: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: ucapsaBrand.colors.surface, fontSize: 16, fontWeight: '900' },
  name: { color: ucapsaBrand.colors.text, fontSize: 15, fontWeight: '900' },
  meta: { color: ucapsaBrand.colors.muted, fontSize: 12, marginTop: 2 },
  dogs: { color: ucapsaBrand.colors.text, fontSize: 11, fontWeight: '800', marginTop: 3 },
  role: { color: ucapsaBrand.colors.redDark, fontSize: 11, fontWeight: '900', marginTop: 3 },
});
