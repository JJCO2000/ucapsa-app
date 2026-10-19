import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Redirect, router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { KeyboardAwareScreen } from '../../components/ui/KeyboardAwareScreen';
import { ucapsaBrand } from '../../constants/brand';
import { preregistrationDirectoryEnabled } from '../../constants/preregistrationFeature';
import { useSession } from '../../hooks/useSession';
import { getAdminPreregisteredDirectory, type AdminPreregistrationRow } from '../../services/preregistration-directory.service';

function levelLabel(value: AdminPreregistrationRow): string {
  if (value.programCode === 'puppy') return 'Puppy';
  return 'Comandos · ' + ({ principiante: 'Básico', medio: 'Intermedio', avanzado: 'Avanzado', base: 'Básico' }[value.programLevel]);
}

export default function AdminPreregistrationsScreen() {
  const { isAdmin } = useSession();
  const [rows, setRows] = useState<AdminPreregistrationRow[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(useCallback(() => {
    if (!isAdmin || !preregistrationDirectoryEnabled) return;
    let active = true;
    setLoading(true);
    setError(null);
    void getAdminPreregisteredDirectory().then((result) => {
      if (active) setRows(result);
    }).catch((cause) => {
      if (active) setError(cause instanceof Error ? cause.message : 'No se pudo cargar.');
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [isAdmin]));

  const visible = useMemo(() => rows.filter((row) =>
    [row.ownerName, row.dogName, row.email ?? '', row.phone ?? '']
      .some((part) => part.toLocaleLowerCase('es-MX').includes(query.trim().toLocaleLowerCase('es-MX'))),
  ), [query, rows]);
  const peopleCount = new Set(rows.map((row) => row.personId)).size;
  if (!isAdmin || !preregistrationDirectoryEnabled) return <Redirect href="/home" />;

  return (
    <KeyboardAwareScreen style={{ backgroundColor: ucapsaBrand.colors.background }}>
      <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.back}>
        <MaterialIcons name="arrow-back" size={20} color={ucapsaBrand.colors.redDark} />
        <Text style={styles.backLabel}>Usuarios</Text>
      </Pressable>
      <Text style={styles.kicker}>Administración · Sin cuenta vinculada</Text>
      <Text style={styles.title}>Preinscripciones</Text>
      <Text style={styles.subtitle}>
        {peopleCount} tutores · {rows.length} programas. Un perro puede estar en más de un programa.
        La membresía oficial se gestiona cuando la cuenta se vincula.
      </Text>
      <Pressable accessibilityRole="button" onPress={() => router.push('/admin/preregister-dog' as never)} style={styles.action}>
        <MaterialIcons name="add" size={20} color={ucapsaBrand.colors.surface} />
        <Text style={styles.actionText}>Registrar perro sin cuenta</Text>
      </Pressable>
      <TextInput style={styles.search} value={query} onChangeText={setQuery}
        placeholder="Buscar tutor, perro o contacto" placeholderTextColor={ucapsaBrand.colors.muted} />
      {loading ? <View style={styles.status}><ActivityIndicator color={ucapsaBrand.colors.red} /><Text>Cargando…</Text></View> : null}
      {error ? <View style={styles.status}><Text style={styles.warning}>{error}</Text></View> : null}
      {!loading && !error && visible.length === 0 ? (
        <View style={styles.status}><Text style={styles.subtitle}>
          {query ? 'Sin coincidencias.' : 'Aún no hay perros preinscritos.'}
        </Text></View>
      ) : null}
      {!loading && !error ? visible.map((row) => (
        <Pressable key={row.programId} accessibilityRole="button"
          accessibilityLabel={`Abrir preinscripción de ${row.dogName}, tutor ${row.ownerName}`}
          onPress={() => router.push(`/admin/preregistration-record?intakeProgramId=${encodeURIComponent(row.programId)}` as never)}
          style={styles.card}>
          <View style={styles.cardTitle}>
            <View style={{ flex: 1 }}>
              <Text style={styles.dog}>{row.dogName}</Text>
              <Text style={styles.owner}>{row.ownerName} · Sin cuenta vinculada</Text>
            </View>
            <MaterialIcons name="chevron-right" size={23} color={ucapsaBrand.colors.redDark}/>
          </View>
          <Text style={styles.meta}>{levelLabel(row)}</Text>
          <Text style={styles.meta}>
            {row.historicalAttendances + row.staffAttendances} asistencias reconocidas
          </Text>
        </Pressable>
      )) : null}
    </KeyboardAwareScreen>
  );
}

const styles = StyleSheet.create({
  back: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  backLabel: { color: ucapsaBrand.colors.redDark, fontWeight: '800' },
  kicker: { fontSize: 11, fontWeight: '900', color: ucapsaBrand.colors.redDark },
  title: { fontSize: 26, fontWeight: '900', color: ucapsaBrand.colors.text, marginTop: 4 },
  subtitle: { fontSize: 12, color: ucapsaBrand.colors.muted, lineHeight: 19, marginTop: 6, marginBottom: 12 },
  action: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: ucapsaBrand.colors.greenDark, padding: 13, borderRadius: 13, marginTop: 10, marginBottom: 15 },
  actionText: { color: ucapsaBrand.colors.surface, fontWeight: '900' },
  search: { minHeight: 45, backgroundColor: ucapsaBrand.colors.surface, borderColor: ucapsaBrand.colors.border, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, color: ucapsaBrand.colors.text },
  status: { marginTop: 20, padding: 16, alignItems: 'center', gap: 8 },
  warning: { color: ucapsaBrand.colors.danger },
  card: { backgroundColor: ucapsaBrand.colors.surface, borderWidth: 1, borderColor: ucapsaBrand.colors.border, padding: 15, borderRadius: 16, marginTop: 10, gap: 6 },
  cardTitle: { flexDirection: 'row', alignItems: 'center' },
  dog: { fontSize: 17, fontWeight: '900', color: ucapsaBrand.colors.text },
  owner: { fontSize: 12, color: ucapsaBrand.colors.muted, marginTop: 4 },
  meta: { fontSize: 12, color: ucapsaBrand.colors.text },
});
