import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Redirect, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, RefreshControl, StyleSheet, Text, View, Pressable } from 'react-native';

import { KeyboardAwareScreen } from '../../components/ui/KeyboardAwareScreen';
import { ucapsaBrand } from '../../constants/brand';
import { useSession } from '../../hooks/useSession';
import { getProgramLevelLabel } from '../../services/programs.service';
import { getStaffClassRoster, type StaffClassRosterRow } from '../../services/staff-operations.service';

function responseMeta(value: StaffClassRosterRow['rsvpResponse']) {
  if (value === 'yes') return { label: 'Confirmado', icon: 'check-circle' as const, bg: ucapsaBrand.colors.successSoft, fg: ucapsaBrand.colors.successDark };
  if (value === 'no') return { label: 'No asistirá', icon: 'cancel' as const, bg: ucapsaBrand.colors.dangerSoft, fg: ucapsaBrand.colors.danger };
  return { label: 'Sin responder', icon: 'schedule' as const, bg: ucapsaBrand.colors.goldPale, fg: ucapsaBrand.colors.goldDark };
}

function responseOrder(value: StaffClassRosterRow['rsvpResponse']) {
  if (value === 'yes') return 0;
  if (value === null) return 1;
  return 2;
}

export default function TrainerRosterScreen() {
  const { date, scheduleId } = useLocalSearchParams<{ date?: string; scheduleId?: string }>();
  const { isStaff, isAdmin } = useSession();
  const dateKey = typeof date === 'string' ? date : '';
  const schedule = typeof scheduleId === 'string' ? scheduleId : '';
  const [rows, setRows] = useState<StaffClassRosterRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!dateKey) {
      setError('Falta la fecha de la clase.');
      setLoading(false);
      return;
    }
    setError(null);
    try {
      const result = await getStaffClassRoster(dateKey);
      setRows(schedule ? result.filter((row) => row.scheduleId === schedule) : result);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo cargar el roster.');
    } finally {
      setLoading(false);
    }
  }, [dateKey, schedule]);

  useFocusEffect(useCallback(() => {
    if (!isStaff) return undefined;
    setLoading(true);
    void load();
    return undefined;
  }, [isStaff, load]));

  const sorted = useMemo(() => [...rows].sort((a, b) =>
    responseOrder(a.rsvpResponse) - responseOrder(b.rsvpResponse)
    || a.programLevel.localeCompare(b.programLevel)
    || a.dogName.localeCompare(b.dogName, 'es-MX')
  ), [rows]);

  const confirmed = rows.filter((row) => row.rsvpResponse === 'yes').length;
  const declined = rows.filter((row) => row.rsvpResponse === 'no').length;
  const pending = rows.filter((row) => row.rsvpResponse === null).length;
  const first = rows[0] ?? null;

  async function refresh() {
    setRefreshing(true);
    try { await load(); } finally { setRefreshing(false); }
  }

  if (!isStaff) return <Redirect href={isAdmin ? '/admin-home' : '/home'} />;

  return (
    <KeyboardAwareScreen refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={ucapsaBrand.colors.green} />}>
      <View style={styles.header}>
        <Text style={styles.kicker}>{dateKey}</Text>
        <Text style={styles.title}>{first?.programCode === 'puppy' ? 'Puppy' : first?.programCode === 'comandos' ? 'Comandos' : 'Clase'}</Text>
        {first ? <Text style={styles.subtitle}>{first.startTime} · {rows.length} inscritos vigentes</Text> : null}
      </View>

      <View style={styles.summaryRow}>
        <Summary value={confirmed} label="Confirmados" tone="success" />
        <Summary value={pending} label="Sin responder" tone="warning" />
        <Summary value={declined} label="No asistirán" tone="danger" />
      </View>

      {loading ? <View style={styles.loading}><ActivityIndicator color={ucapsaBrand.colors.green} /><Text style={styles.muted}>Cargando lista…</Text></View> : null}
      {error ? <View style={styles.error}><Text style={styles.errorText}>{error}</Text></View> : null}

      {!loading && !error && sorted.length === 0 ? (
        <View style={styles.empty}>
          <MaterialIcons name="event-busy" size={28} color={ucapsaBrand.colors.muted} />
          <Text style={styles.emptyTitle}>Sin alumnos para esta clase</Text>
          <Text style={styles.muted}>Puede ser una cancelación, cambio de horario o que no haya inscripciones vigentes.</Text>
        </View>
      ) : null}

      <View style={styles.list}>
        {sorted.map((row) => {
          const response = responseMeta(row.rsvpResponse);
          const level = row.programCode === 'comandos' ? getProgramLevelLabel(row.programLevel as never) : 'Puppy';
          return (
            <Pressable
              key={row.enrollmentId}
              disabled={!row.dogId}
              style={styles.row}
              onPress={() => row.dogId && router.push(`/trainer/dog?dogId=${encodeURIComponent(row.dogId)}` as never)}
            >
              <View style={[styles.responseIcon, { backgroundColor: response.bg }]}>
                <MaterialIcons name={response.icon} size={20} color={response.fg} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <View style={styles.nameLine}>
                  <Text numberOfLines={1} style={styles.dogName}>{row.dogName}</Text>
                  <Text style={[styles.levelPill, row.programCode === 'comandos' && styles.levelPillCommands]}>{level}</Text>
                </View>
                <Text numberOfLines={1} style={styles.owner}>{row.ownerName}</Text>
                <View style={styles.metaLine}>
                  <Text style={[styles.responseText, { color: response.fg }]}>{response.label}</Text>
                  {row.membershipStatus === 'active' ? <Text style={styles.member}>Socio</Text> : null}
                </View>
              </View>
              {row.dogId ? <MaterialIcons name="chevron-right" size={22} color={ucapsaBrand.colors.greenDark} /> : null}
            </Pressable>
          );
        })}
      </View>
    </KeyboardAwareScreen>
  );
}

function Summary({ value, label, tone }: { value: number; label: string; tone: 'success' | 'warning' | 'danger' }) {
  const backgroundColor = tone === 'success'
    ? ucapsaBrand.colors.successSoft
    : tone === 'danger'
      ? ucapsaBrand.colors.dangerSoft
      : ucapsaBrand.colors.goldPale;
  const color = tone === 'success'
    ? ucapsaBrand.colors.successDark
    : tone === 'danger'
      ? ucapsaBrand.colors.danger
      : ucapsaBrand.colors.goldDark;
  return (
    <View style={[styles.summary, { backgroundColor }]}>
      <Text style={[styles.summaryValue, { color }]}>{value}</Text>
      <Text style={[styles.summaryLabel, { color }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { marginBottom: 12 },
  kicker: { color: ucapsaBrand.colors.greenDark, fontSize: 10, fontWeight: '900', letterSpacing: 0.7 },
  title: { color: ucapsaBrand.colors.text, fontSize: 28, lineHeight: 33, fontWeight: '900', marginTop: 2 },
  subtitle: { color: ucapsaBrand.colors.muted, fontSize: 12, fontWeight: '800', marginTop: 3 },
  summaryRow: { flexDirection: 'row', gap: 7, marginBottom: 13 },
  summary: { flex: 1, alignItems: 'center', borderRadius: 15, paddingVertical: 9, paddingHorizontal: 5 },
  summaryValue: { fontSize: 19, fontWeight: '900' },
  summaryLabel: { fontSize: 8, lineHeight: 11, fontWeight: '900', textAlign: 'center', marginTop: 1 },
  loading: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, padding: 18 },
  muted: { color: ucapsaBrand.colors.muted, fontSize: 11, lineHeight: 16, fontWeight: '700' },
  error: { borderRadius: 16, backgroundColor: ucapsaBrand.colors.dangerSoft, padding: 12 },
  errorText: { color: ucapsaBrand.colors.danger, fontSize: 11, fontWeight: '800' },
  empty: { alignItems: 'center', gap: 7, borderRadius: 19, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, padding: 18 },
  emptyTitle: { color: ucapsaBrand.colors.text, fontSize: 15, fontWeight: '900' },
  list: { gap: 8 },
  row: { minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 18, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, padding: 11 },
  responseIcon: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  nameLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dogName: { flexShrink: 1, color: ucapsaBrand.colors.text, fontSize: 14, fontWeight: '900' },
  owner: { color: ucapsaBrand.colors.muted, fontSize: 10, fontWeight: '700', marginTop: 2 },
  levelPill: { color: ucapsaBrand.colors.goldDark, backgroundColor: ucapsaBrand.colors.goldPale, borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2, fontSize: 8, fontWeight: '900' },
  levelPillCommands: { color: ucapsaBrand.colors.purpleDark, backgroundColor: ucapsaBrand.colors.purpleSoft },
  metaLine: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 5 },
  responseText: { fontSize: 9, fontWeight: '900' },
  member: { color: ucapsaBrand.colors.purpleDark, backgroundColor: ucapsaBrand.colors.purpleSoft, borderRadius: 999, paddingHorizontal: 6, paddingVertical: 2, fontSize: 8, fontWeight: '900' },
});
