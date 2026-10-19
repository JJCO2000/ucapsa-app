import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';

import { KeyboardAwareScreen } from '../../components/ui/KeyboardAwareScreen';
import { ucapsaBrand } from '../../constants/brand';
import { manualPreregistrationLinkEnabled, preregistrationDirectoryEnabled } from '../../constants/preregistrationFeature';
import { useSession } from '../../hooks/useSession';
import {
  getAdminPreregistrationRecords,
  preregistrationLevelLabel,
  type AdminPreregistrationRecord,
} from '../../services/preregistration-admin.service';

export default function AdminPreregistrationsScreen() {
  const { isAdmin } = useSession();
  const [rows, setRows] = useState<AdminPreregistrationRecord[]>([]);
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      setRows(await getAdminPreregistrationRecords());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudieron consultar las preinscripciones.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    if (!isAdmin || !preregistrationDirectoryEnabled) return;
    setLoading(true);
    void load();
  }, [isAdmin, load]));

  const visible = useMemo(() => {
    const q = filter.trim().toLocaleLowerCase('es-MX');
    if (!q) return rows;
    return rows.filter(row =>
      [row.ownerName, row.dogName, row.ownerEmail ?? '', row.ownerPhone ?? '',
        row.programCode, preregistrationLevelLabel(row)]
        .some(value => value.toLocaleLowerCase('es-MX').includes(q)));
  }, [filter, rows]);

  if (!isAdmin || !preregistrationDirectoryEnabled) return null;

  return (
    <KeyboardAwareScreen refreshControl={<RefreshControl refreshing={refreshing} tintColor={ucapsaBrand.colors.red}
      onRefresh={() => { setRefreshing(true); void load(); }} />}>
      <Pressable accessibilityRole="button" style={styles.back} onPress={() => router.back()}>
        <MaterialIcons name="arrow-back" size={20} color={ucapsaBrand.colors.redDark} />
        <Text style={styles.backText}>Clientes</Text>
      </Pressable>
      <Text style={styles.kicker}>Administración · Registro</Text>
      <Text style={styles.title}>Preinscripciones</Text>
      <Text style={styles.helper}>Expedientes autorizados antes de crear cuenta. La membresía oficial se consulta por separado.</Text>

      <Pressable accessibilityRole="button" style={styles.primary}
        onPress={() => router.push('/admin/preregister-dog' as never)}>
        <MaterialIcons name="add" size={20} color={ucapsaBrand.colors.surface} />
        <Text style={styles.primaryText}>Registrar perro sin cuenta</Text>
      </Pressable>
      {manualPreregistrationLinkEnabled ? (
        <Pressable accessibilityRole="button" style={styles.primary}
          onPress={() => router.push('/admin/preregistration-link-requests' as never)}>
          <MaterialIcons name="how-to-reg" size={20} color={ucapsaBrand.colors.surface}/>
          <Text style={styles.primaryText}>Solicitudes de vinculación</Text>
        </Pressable>
      ) : null}
      <TextInput style={styles.search} value={filter} onChangeText={setFilter}
        accessibilityLabel="Buscar preinscripciones"
        placeholder="Buscar tutor, perro, teléfono o programa"
        placeholderTextColor={ucapsaBrand.colors.muted} autoCapitalize="none" />

      {loading ? <View style={styles.center}><ActivityIndicator color={ucapsaBrand.colors.red} /><Text style={styles.muted}>Cargando expedientes…</Text></View> : null}
      {error ? (
        <View style={styles.card}>
          <Text style={styles.error}>{error}</Text>
          <Pressable accessibilityRole="button" onPress={() => { setLoading(true); void load(); }}>
            <Text style={styles.link}>Reintentar</Text>
          </Pressable>
        </View>
      ) : null}
      {!loading && !error && visible.length === 0 ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{filter ? 'Sin coincidencias' : 'Aún no hay preinscripciones'}</Text>
          <Text style={styles.muted}>{filter ? 'Prueba con otro nombre o dato de contacto.' : 'Registra un perro sin crear una cuenta ficticia.'}</Text>
        </View>
      ) : null}
      {!loading && !error ? visible.map(row => (
        <Pressable key={row.intakeProgramId} accessibilityRole="button"
          accessibilityLabel={`Abrir preinscripción de ${row.dogName}, ${row.ownerName}`}
          style={styles.card}
          onPress={() => router.push(('/admin/preregistration?intakeProgramId=' +
            encodeURIComponent(row.intakeProgramId)) as never)}>
          <View style={styles.line}>
            <MaterialIcons name="pets" size={22} color={ucapsaBrand.colors.redDark} />
            <View style={styles.main}>
              <Text style={styles.cardTitle}>{row.dogName}</Text>
              <Text style={styles.muted}>{row.ownerName}</Text>
              <Text style={styles.meta}>{row.programCode === 'comandos' ? 'Comandos · ' : ''}{preregistrationLevelLabel(row)}</Text>
              <Text style={styles.meta}>{row.attendancesCount} asistencias reconocidas · {row.status === 'linked' ? 'Cuenta vinculada' : 'Sin cuenta vinculada'}</Text>
            </View>
            <MaterialIcons name="chevron-right" size={21} color={ucapsaBrand.colors.redDark} />
          </View>
        </Pressable>
      )) : null}
    </KeyboardAwareScreen>
  );
}

const styles = StyleSheet.create({
  back: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 14 },
  backText: { color: ucapsaBrand.colors.redDark, fontWeight: '800', fontSize: 13 },
  kicker: { fontSize: 11, color: ucapsaBrand.colors.redDark, fontWeight: '900' },
  title: { fontSize: 27, color: ucapsaBrand.colors.text, fontWeight: '900', marginTop: 4 },
  helper: { color: ucapsaBrand.colors.muted, fontSize: 12, lineHeight: 18, marginTop: 7, marginBottom: 15 },
  primary: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8,
    minHeight: 50, backgroundColor: ucapsaBrand.colors.greenDark, borderRadius: 13 },
  primaryText: { color: ucapsaBrand.colors.surface, fontWeight: '900', fontSize: 14 },
  search: { borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface,
    borderRadius: 12, minHeight: 48, paddingHorizontal: 13, color: ucapsaBrand.colors.text, marginTop: 15, marginBottom: 14 },
  center: { padding: 15, alignItems: 'center', gap: 8 },
  card: { padding: 16, backgroundColor: ucapsaBrand.colors.surface, borderColor: ucapsaBrand.colors.border,
    borderWidth: 1, borderRadius: 16, marginBottom: 10 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  main: { flex: 1 },
  cardTitle: { color: ucapsaBrand.colors.text, fontSize: 16, fontWeight: '900' },
  muted: { color: ucapsaBrand.colors.muted, fontSize: 12, marginTop: 3 },
  meta: { color: ucapsaBrand.colors.redDark, fontSize: 12, fontWeight: '700', marginTop: 4 },
  error: { color: ucapsaBrand.colors.danger, fontSize: 13, marginBottom: 8 },
  link: { color: ucapsaBrand.colors.redDark, fontWeight: '900', fontSize: 13 },
});
