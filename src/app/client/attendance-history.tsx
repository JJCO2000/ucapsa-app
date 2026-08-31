import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Redirect, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { KeyboardAwareScreen } from '../../components/ui/KeyboardAwareScreen';
import { OfflineDataNotice } from '../../components/ui/OfflineDataNotice';
import { resolveUcapsaFormat } from '../../constants/ucapsaFormats';
import { ucapsaBrand, withAlpha } from '../../constants/brand';
import { useSession } from '../../hooks/useSession';
import { getMyProgramEnrollments, getProgramCodeLabel } from '../../services/programs.service';
import { clientReadKeys, readClientResource, sanitizeProgramRowsForCache, writeClientResource } from '../../services/client-read-cache.service';
import { DEFAULT_READ_TIMEOUT_MS, friendlyReadError, withOperationTimeout } from '../../utils/async.utils';
import type { ProgramEnrollmentWithDetails } from '../../types/app.types';

const monthNames = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
function dateLabel(value: string) {
  const date = new Date(`${value.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return `${String(date.getDate()).padStart(2, '0')} ${monthNames[date.getMonth()]} ${date.getFullYear()}`;
}

export default function AttendanceHistoryScreen() {
  const { enrollmentId } = useLocalSearchParams<{ enrollmentId?: string }>();
  const { user, role, isAdmin } = useSession();
  const [item, setItem] = useState<ProgramEnrollmentWithDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [usingSavedData, setUsingSavedData] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const format = useMemo(() => resolveUcapsaFormat({ user, role, isAdmin, hasActivePrograms: Boolean(item?.enrollment.status === 'active') }), [isAdmin, item?.enrollment.status, role, user]);
  const premium = format.key === 'member';

  const load = useCallback(async () => {
    if (!user || isAdmin || !enrollmentId) return;
    setError(null);
    setUsingSavedData(false);

    const cached = await readClientResource<ProgramEnrollmentWithDetails[]>(user.id, clientReadKeys.programs);
    const cachedItem = cached?.data.find((row) => row.enrollment.id === enrollmentId) ?? null;
    if (cachedItem) {
      setItem(cachedItem);
      setSavedAt(cached?.saved_at ?? null);
      setLoading(false);
    }

    try {
      const rows = await withOperationTimeout(getMyProgramEnrollments(), DEFAULT_READ_TIMEOUT_MS, 'attendance-history');
      setItem(rows.find((row) => row.enrollment.id === enrollmentId) ?? null);
      const stored = await writeClientResource(user.id, clientReadKeys.programs, sanitizeProgramRowsForCache(rows));
      setSavedAt(stored.saved_at);
    } catch {
      if (cachedItem) setUsingSavedData(true);
      else setError(friendlyReadError('No se pudieron cargar tus asistencias.'));
    } finally {
      setLoading(false);
    }
  }, [enrollmentId, isAdmin, user]);

  useFocusEffect(useCallback(() => { void load(); return undefined; }, [load]));
  const attendances = useMemo(() => [...(item?.attendances ?? [])].sort((a, b) => b.attendance_date.localeCompare(a.attendance_date)), [item]);

  async function refresh() { setRefreshing(true); try { await load(); } finally { setRefreshing(false); } }

  if (!user) return <Redirect href="/auth/login" />;
  if (isAdmin) return <Redirect href="/admin-classes" />;

  return (
    <KeyboardAwareScreen backgroundColor={format.background} style={{ backgroundColor: format.background }} contentContainerStyle={premium ? styles.premiumContent : undefined} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={format.accent} />}>
      {usingSavedData ? <OfflineDataNotice savedAt={savedAt} onRetry={() => void refresh()} premium={premium} /> : null}
      {loading ? <View style={styles.loading}><ActivityIndicator color={format.accent} /><Text style={[styles.muted, { color: format.muted }]}>Cargando...</Text></View> : null}
      {error ? <View style={[styles.errorBox, { borderColor: premium ? withAlpha(ucapsaBrand.colors.gold, 0.35) : ucapsaBrand.colors.dangerBorder, backgroundColor: premium ? ucapsaBrand.colors.premiumSurface : ucapsaBrand.colors.dangerSoft }]}><Text style={[styles.errorTitle, { color: premium ? ucapsaBrand.colors.premiumAction : ucapsaBrand.colors.danger }]}>No se pudo cargar</Text><Text style={[styles.muted, { color: format.muted }]}>{error}</Text><Pressable style={[styles.retryButton, { borderColor: format.cardBorder, backgroundColor: format.secondaryButton }]} onPress={() => void refresh()}><Text style={[styles.retryText, { color: format.secondaryButtonText }]}>Reintentar</Text></Pressable></View> : null}
      {!loading && !error && !item ? <View style={styles.empty}><Text style={[styles.title, { color: format.text }]}>Clase no encontrada</Text></View> : null}
      {item ? (
        <>
          <Text style={[styles.kicker, { color: premium ? ucapsaBrand.colors.premiumAction : format.accentDark }]}>{getProgramCodeLabel(item.program.code)}</Text>
          <Text style={[styles.title, { color: format.text }]}>Asistencias</Text>
          <Text style={[styles.subtitle, { color: format.muted }]}>{attendances.length} registros reales.</Text>
          <View style={[styles.list, { borderColor: format.cardBorder, backgroundColor: format.cardBackground }]}>
            {attendances.length === 0 ? <Text style={[styles.muted, { color: format.muted }]}>Todavia no hay asistencias.</Text> : attendances.map((attendance) => (
              <View key={attendance.id} style={[styles.row, premium && styles.rowPremium]}>
                <MaterialIcons name="check-circle" size={20} color={premium ? ucapsaBrand.colors.gold : ucapsaBrand.colors.success} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.date, { color: format.cardText }]}>{dateLabel(attendance.attendance_date)}</Text>
                  <Text style={[styles.muted, { color: format.muted }]}>{attendance.source === 'qr_client' ? 'Registrada con QR' : 'Registro UCAPSA'}</Text>
                  {attendance.notes ? <Text style={[styles.note, { color: format.cardText }]}>{attendance.notes}</Text> : null}
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
  premiumContent: { backgroundColor: ucapsaBrand.colors.premiumBackground },
  loading: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 20 },
  kicker: { fontSize: 12, fontWeight: '900', textTransform: 'uppercase' },
  title: { fontSize: 28, fontWeight: '900' },
  subtitle: { fontSize: 13, fontWeight: '700', marginBottom: 16 },
  muted: { fontSize: 13, lineHeight: 19, fontWeight: '700' },
  empty: { paddingVertical: 24 },
  errorBox: { gap: 7, borderRadius: 18, borderWidth: 1, padding: 15 },
  errorTitle: { fontSize: 16, fontWeight: '900' },
  retryButton: { alignSelf: 'flex-start', borderRadius: 14, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 10 },
  retryText: { fontSize: 12, fontWeight: '900' },
  list: { borderRadius: 20, borderWidth: 1, padding: 15 },
  row: { flexDirection: 'row', gap: 10, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: ucapsaBrand.colors.premiumMuted },
  rowPremium: { borderBottomColor: withAlpha(ucapsaBrand.colors.gold, 0.16) },
  date: { fontSize: 14, fontWeight: '900' },
  note: { fontSize: 12, lineHeight: 18, marginTop: 4 },
});
