import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Redirect, router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, RefreshControl, StyleSheet, Text, TextInput, View, Pressable } from 'react-native';

import { KeyboardAwareScreen } from '../../components/ui/KeyboardAwareScreen';
import { ucapsaBrand } from '../../constants/brand';
import { useSession } from '../../hooks/useSession';
import { getProgramLevelLabel } from '../../services/programs.service';
import { getStaffDogs, type StaffDogRow } from '../../services/staff-operations.service';

function noteTone(severity: string | null) {
  if (severity === 'high') return { bg: ucapsaBrand.colors.dangerSoft, fg: ucapsaBrand.colors.danger, icon: 'warning' as const };
  if (severity === 'watch') return { bg: ucapsaBrand.colors.goldPale, fg: ucapsaBrand.colors.goldDark, icon: 'visibility' as const };
  return { bg: ucapsaBrand.colors.blueSoft, fg: ucapsaBrand.colors.blueDark, icon: 'notes' as const };
}

export default function TrainerDogsTab() {
  const { isTrainer, isStaff, isAdmin } = useSession();
  const [rows, setRows] = useState<StaffDogRow[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setRows(await getStaffDogs());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudieron cargar los perros.');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    if (!isStaff) return undefined;
    setLoading(true);
    void load();
    return undefined;
  }, [isStaff, load]));

  const visible = useMemo(() => {
    const term = query.trim().toLocaleLowerCase('es-MX');
    if (!term) return rows;
    return rows.filter((row) =>
      [row.dogName, row.ownerName, row.programCode ?? '', row.programLevel ?? '', row.latestStaffNote ?? '', row.behaviorNotes ?? '']
        .some((value) => value.toLocaleLowerCase('es-MX').includes(term)),
    );
  }, [query, rows]);

  async function refresh() {
    setRefreshing(true);
    try { await load(); } finally { setRefreshing(false); }
  }

  if (!isStaff) return <Redirect href={isAdmin ? '/admin-home' : '/home'} />;

  return (
    <KeyboardAwareScreen refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={ucapsaBrand.colors.green} />}>
      <View style={styles.header}>
        <Text style={styles.kicker}>OPERACIÓN</Text>
        <Text style={styles.title}>Perros</Text>
        <Text style={styles.subtitle}>Consulta lo necesario para entrenar con seguridad y conservar el historial del perro.</Text>
      </View>

      <View style={styles.search}>
        <MaterialIcons name="search" size={20} color={ucapsaBrand.colors.muted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Perro, dueño o nota"
          placeholderTextColor={ucapsaBrand.colors.muted}
          style={styles.searchInput}
        />
        {query ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Limpiar búsqueda" onPress={() => setQuery('')}>
            <MaterialIcons name="close" size={20} color={ucapsaBrand.colors.muted} />
          </Pressable>
        ) : null}
      </View>

      {loading ? <View style={styles.loading}><ActivityIndicator color={ucapsaBrand.colors.green} /><Text style={styles.muted}>Cargando perros…</Text></View> : null}
      {error ? <View style={styles.error}><Text style={styles.errorText}>{error}</Text></View> : null}

      <View style={styles.list}>
        {visible.map((row) => {
          const tone = noteTone(row.latestNoteSeverity);
          const program = row.programCode === 'puppy'
            ? 'Puppy'
            : row.programCode === 'comandos'
              ? `Comandos · ${getProgramLevelLabel(row.programLevel as never)}`
              : 'Sin programa activo';

          return (
            <Pressable
              key={row.dogId}
              style={styles.row}
              onPress={() => router.push(`/trainer/dog?dogId=${encodeURIComponent(row.dogId)}` as never)}
            >
              <View style={[styles.avatar, { backgroundColor: row.latestNoteSeverity === 'high' ? ucapsaBrand.colors.dangerSoft : ucapsaBrand.colors.greenSoft }]}>
                <MaterialIcons name="pets" size={23} color={row.latestNoteSeverity === 'high' ? ucapsaBrand.colors.danger : ucapsaBrand.colors.greenDark} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <View style={styles.nameLine}>
                  <Text numberOfLines={1} style={styles.dogName}>{row.dogName}</Text>
                  {row.membershipStatus === 'active' ? <Text style={styles.memberPill}>Socio</Text> : null}
                </View>
                <Text numberOfLines={1} style={styles.owner}>{row.ownerName} · {program}</Text>
                {row.latestStaffNote ? (
                  <View style={[styles.notePreview, { backgroundColor: tone.bg }]}>
                    <MaterialIcons name={tone.icon} size={15} color={tone.fg} />
                    <Text numberOfLines={2} style={[styles.noteText, { color: tone.fg }]}>{row.latestStaffNote}</Text>
                  </View>
                ) : row.behaviorNotes ? (
                  <View style={[styles.notePreview, { backgroundColor: ucapsaBrand.colors.goldPale }]}>
                    <MaterialIcons name="psychology" size={15} color={ucapsaBrand.colors.goldDark} />
                    <Text numberOfLines={2} style={[styles.noteText, { color: ucapsaBrand.colors.goldDark }]}>{row.behaviorNotes}</Text>
                  </View>
                ) : null}
              </View>
              <MaterialIcons name="chevron-right" size={22} color={ucapsaBrand.colors.greenDark} />
            </Pressable>
          );
        })}
      </View>

      {!loading && !error && visible.length === 0 ? (
        <View style={styles.empty}><Text style={styles.emptyTitle}>Sin coincidencias</Text><Text style={styles.muted}>Prueba con el nombre del perro o del dueño.</Text></View>
      ) : null}
    </KeyboardAwareScreen>
  );
}

const styles = StyleSheet.create({
  header: { marginBottom: 13 },
  kicker: { color: ucapsaBrand.colors.greenDark, fontSize: 10, fontWeight: '900', letterSpacing: 0.8 },
  title: { color: ucapsaBrand.colors.text, fontSize: 28, lineHeight: 33, fontWeight: '900', marginTop: 2 },
  subtitle: { color: ucapsaBrand.colors.muted, fontSize: 11, lineHeight: 16, fontWeight: '700', marginTop: 3 },
  search: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 16, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, paddingHorizontal: 12, marginBottom: 12 },
  searchInput: { flex: 1, color: ucapsaBrand.colors.text, fontSize: 13, fontWeight: '700', paddingVertical: 10 },
  loading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 18 },
  muted: { color: ucapsaBrand.colors.muted, fontSize: 11, lineHeight: 16, fontWeight: '700' },
  error: { borderRadius: 16, backgroundColor: ucapsaBrand.colors.dangerSoft, padding: 12, marginBottom: 10 },
  errorText: { color: ucapsaBrand.colors.danger, fontSize: 11, fontWeight: '800' },
  list: { gap: 8 },
  row: { minHeight: 82, flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 19, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, padding: 11 },
  avatar: { width: 45, height: 45, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  nameLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dogName: { flexShrink: 1, color: ucapsaBrand.colors.text, fontSize: 15, fontWeight: '900' },
  owner: { color: ucapsaBrand.colors.muted, fontSize: 10, lineHeight: 14, fontWeight: '700', marginTop: 2 },
  memberPill: { color: ucapsaBrand.colors.purpleDark, backgroundColor: ucapsaBrand.colors.purpleSoft, borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2, fontSize: 8, fontWeight: '900' },
  notePreview: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 10, paddingHorizontal: 7, paddingVertical: 5, marginTop: 6 },
  noteText: { flex: 1, fontSize: 9, lineHeight: 13, fontWeight: '800' },
  empty: { alignItems: 'center', borderRadius: 18, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, padding: 18 },
  emptyTitle: { color: ucapsaBrand.colors.text, fontSize: 15, fontWeight: '900' },
});
