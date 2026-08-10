import { MaterialIcons } from '@expo/vector-icons';
import { Redirect, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { KeyboardAwareScreen } from '../../components/ui/KeyboardAwareScreen';
import { ucapsaBrand } from '../../constants/brand';
import { useSession } from '../../hooks/useSession';
import { getMyProgramEnrollments, getProgramCodeLabel } from '../../services/programs.service';
import type { ProgramEnrollmentWithDetails } from '../../types/app.types';

const monthNames = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
function dateLabel(value: string) {
  const date = new Date(`${value.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return `${String(date.getDate()).padStart(2, '0')} ${monthNames[date.getMonth()]} ${date.getFullYear()}`;
}

export default function AttendanceHistoryScreen() {
  const { enrollmentId } = useLocalSearchParams<{ enrollmentId?: string }>();
  const { user, isAdmin } = useSession();
  const [item, setItem] = useState<ProgramEnrollmentWithDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!user || isAdmin || !enrollmentId) return;
    const rows = await getMyProgramEnrollments();
    setItem(rows.find((row) => row.enrollment.id === enrollmentId) ?? null);
    setLoading(false);
  }, [enrollmentId, isAdmin, user]);

  useFocusEffect(useCallback(() => { void load().catch(() => setLoading(false)); return undefined; }, [load]));
  const attendances = useMemo(() => [...(item?.attendances ?? [])].sort((a, b) => b.attendance_date.localeCompare(a.attendance_date)), [item]);

  async function refresh() {
    setRefreshing(true);
    try { await load(); } finally { setRefreshing(false); }
  }

  if (!user) return <Redirect href="/auth/login" />;
  if (isAdmin) return <Redirect href="/admin-classes" />;

  return (
    <KeyboardAwareScreen refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={ucapsaBrand.colors.red} />}>
      {loading ? <View style={styles.loading}><ActivityIndicator color={ucapsaBrand.colors.red} /><Text style={styles.muted}>Cargando...</Text></View> : null}
      {!loading && !item ? <View style={styles.empty}><Text style={styles.title}>Clase no encontrada</Text></View> : null}
      {item ? (
        <>
          <Text style={styles.kicker}>{getProgramCodeLabel(item.program.code)}</Text>
          <Text style={styles.title}>Asistencias</Text>
          <Text style={styles.subtitle}>{attendances.length} registros reales.</Text>
          <View style={styles.list}>
            {attendances.length === 0 ? <Text style={styles.muted}>Todavia no hay asistencias.</Text> : attendances.map((attendance) => (
              <View key={attendance.id} style={styles.row}>
                <MaterialIcons name="check-circle" size={20} color={ucapsaBrand.colors.success} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.date}>{dateLabel(attendance.attendance_date)}</Text>
                  <Text style={styles.muted}>{attendance.source === 'qr_client' ? 'Registrada con QR' : 'Registro UCAPSA'}</Text>
                  {attendance.notes ? <Text style={styles.note}>{attendance.notes}</Text> : null}
                </View>
              </View>
            ))}
          </View>
        </>
      ) : null}
    </KeyboardAwareScreen>
  );
}

const styles = StyleSheet.create({
  loading: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 20 },
  kicker: { color: ucapsaBrand.colors.redDark, fontSize: 12, fontWeight: '900', textTransform: 'uppercase' },
  title: { color: ucapsaBrand.colors.text, fontSize: 28, fontWeight: '900' },
  subtitle: { color: ucapsaBrand.colors.muted, fontSize: 13, fontWeight: '700', marginBottom: 16 },
  muted: { color: ucapsaBrand.colors.muted, fontSize: 13, lineHeight: 19, fontWeight: '700' },
  empty: { paddingVertical: 24 },
  list: { borderRadius: 20, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: '#fff', padding: 15 },
  row: { flexDirection: 'row', gap: 10, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F4E5E8' },
  date: { color: ucapsaBrand.colors.text, fontSize: 14, fontWeight: '900' },
  note: { color: ucapsaBrand.colors.text, fontSize: 12, lineHeight: 18, marginTop: 4 },
});
