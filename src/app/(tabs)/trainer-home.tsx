import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Redirect, router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { KeyboardAwareScreen } from '../../components/ui/KeyboardAwareScreen';
import { ucapsaBrand } from '../../constants/brand';
import { useSession } from '../../hooks/useSession';
import { tomorrowDateKey } from '../../services/class-rsvp.service';
import { getProgramLevelLabel } from '../../services/programs.service';
import { getStaffClassSummary, type StaffClassSummary } from '../../services/staff-operations.service';

type SummaryGroup = {
  key: string;
  programCode: string;
  startTime: string;
  scheduleId: string;
  rows: StaffClassSummary[];
};

function dateLabel(dateKey: string) {
  const date = new Date(`${dateKey}T12:00:00`);
  return date.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'short' });
}

function groupSummary(rows: StaffClassSummary[]): SummaryGroup[] {
  const groups = new Map<string, SummaryGroup>();
  for (const row of rows) {
    const key = `${row.programCode}:${row.scheduleId}:${row.startTime}`;
    const existing = groups.get(key);
    if (existing) {
      existing.rows.push(row);
    } else {
      groups.set(key, {
        key,
        programCode: row.programCode,
        startTime: row.startTime,
        scheduleId: row.scheduleId,
        rows: [row],
      });
    }
  }
  return [...groups.values()].sort((a, b) => a.startTime.localeCompare(b.startTime));
}

export default function TrainerHomeTab() {
  const { profile, isTrainer, isStaff, isAdmin } = useSession();
  const [rows, setRows] = useState<StaffClassSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tomorrow = tomorrowDateKey();

  const load = useCallback(async () => {
    setError(null);
    try {
      setRows(await getStaffClassSummary(tomorrow));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo cargar la asistencia esperada.');
    } finally {
      setLoading(false);
    }
  }, [tomorrow]);

  useFocusEffect(useCallback(() => {
    if (!isStaff) return undefined;
    setLoading(true);
    void load();
    return undefined;
  }, [isStaff, load]));

  const groups = useMemo(() => groupSummary(rows), [rows]);
  const totalConfirmed = rows.reduce((sum, row) => sum + row.confirmedCount, 0);
  const totalEligible = rows.reduce((sum, row) => sum + row.eligibleCount, 0);
  const totalPending = rows.reduce((sum, row) => sum + row.noResponseCount, 0);

  async function refresh() {
    setRefreshing(true);
    try { await load(); } finally { setRefreshing(false); }
  }

  if (!isStaff) return <Redirect href={isAdmin ? '/admin-home' : '/home'} />;

  return (
    <KeyboardAwareScreen refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={ucapsaBrand.colors.green} />}>
      <View style={styles.hero}>
        <Text style={styles.kicker}>ENTRENAMIENTO</Text>
        <Text style={styles.title}>Hola, {(profile?.full_name || 'Entrenador').split(' ')[0]}</Text>
        <Text style={styles.subtitle}>Lo necesario para preparar las clases y trabajar con los perros.</Text>
      </View>

      <View style={styles.tomorrowHeader}>
        <View>
          <Text style={styles.eyebrow}>MAÑANA</Text>
          <Text style={styles.sectionTitle}>{dateLabel(tomorrow)}</Text>
        </View>
        {!loading ? (
          <View style={styles.totalPill}>
            <Text style={styles.totalPillValue}>{totalConfirmed}/{totalEligible}</Text>
            <Text style={styles.totalPillLabel}>confirmados</Text>
          </View>
        ) : null}
      </View>

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={ucapsaBrand.colors.green} />
          <Text style={styles.muted}>Preparando las clases de mañana…</Text>
        </View>
      ) : null}

      {error ? (
        <View style={styles.errorCard}>
          <MaterialIcons name="cloud-off" size={20} color={ucapsaBrand.colors.danger} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      {!loading && !error && groups.length === 0 ? (
        <View style={styles.emptyCard}>
          <MaterialIcons name="event-busy" size={28} color={ucapsaBrand.colors.muted} />
          <Text style={styles.emptyTitle}>No hay clases mañana</Text>
          <Text style={styles.muted}>Si un horario se cancela o cambia de fecha, deja de aparecer aquí automáticamente.</Text>
        </View>
      ) : null}

      <View style={styles.classList}>
        {groups.map((group) => {
          const puppy = group.programCode === 'puppy';
          const confirmed = group.rows.reduce((sum, row) => sum + row.confirmedCount, 0);
          const eligible = group.rows.reduce((sum, row) => sum + row.eligibleCount, 0);
          const declined = group.rows.reduce((sum, row) => sum + row.declinedCount, 0);
          const pending = group.rows.reduce((sum, row) => sum + row.noResponseCount, 0);

          return (
            <Pressable
              key={group.key}
              accessibilityRole="button"
              accessibilityLabel={`${puppy ? 'Puppy' : 'Comandos'} a las ${group.startTime}, ${confirmed} de ${eligible} confirmados`}
              style={styles.classCard}
              onPress={() => router.push(`/trainer/roster?date=${encodeURIComponent(tomorrow)}&scheduleId=${encodeURIComponent(group.scheduleId)}` as never)}
            >
              <View style={[styles.classIcon, { backgroundColor: puppy ? ucapsaBrand.colors.goldPale : ucapsaBrand.colors.purpleSoft }]}>
                <MaterialIcons name={puppy ? 'pets' : 'school'} size={24} color={puppy ? ucapsaBrand.colors.goldDark : ucapsaBrand.colors.purpleDark} />
              </View>

              <View style={{ flex: 1, minWidth: 0 }}>
                <View style={styles.classTitleRow}>
                  <Text style={styles.classTitle}>{puppy ? 'Puppy' : 'Comandos'}</Text>
                  <Text style={styles.time}>{group.startTime}</Text>
                </View>

                {puppy ? (
                  <Text style={styles.confirmed}>{confirmed} / {eligible} confirmados</Text>
                ) : (
                  <View style={styles.levelList}>
                    {group.rows
                      .sort((a, b) => {
                        const order = { principiante: 1, medio: 2, avanzado: 3 } as Record<string, number>;
                        return (order[a.programLevel] ?? 9) - (order[b.programLevel] ?? 9);
                      })
                      .map((row) => (
                        <View key={row.programLevel} style={styles.levelRow}>
                          <Text style={styles.levelName}>{getProgramLevelLabel(row.programLevel as never)}</Text>
                          <Text style={styles.levelCount}>{row.confirmedCount} / {row.eligibleCount}</Text>
                        </View>
                      ))}
                  </View>
                )}

                <Text style={styles.classMeta}>{declined} no irá · {pending} sin responder</Text>
              </View>
              <MaterialIcons name="chevron-right" size={23} color={ucapsaBrand.colors.greenDark} />
            </Pressable>
          );
        })}
      </View>

      {!loading && totalPending > 0 ? (
        <View style={styles.pendingNotice}>
          <MaterialIcons name="schedule" size={19} color={ucapsaBrand.colors.goldDark} />
          <Text style={styles.pendingText}>{totalPending} cliente{totalPending === 1 ? '' : 's'} todavía no confirma{totalPending === 1 ? '' : 'n'}.</Text>
        </View>
      ) : null}

      <View style={styles.quickGrid}>
        <Pressable style={styles.quickCard} onPress={() => router.push('/trainer-dogs' as never)}>
          <MaterialIcons name="pets" size={23} color={ucapsaBrand.colors.blueDark} />
          <Text style={styles.quickTitle}>Perros</Text>
          <Text style={styles.quickMeta}>Conducta e historial operativo</Text>
        </Pressable>
        <Pressable style={styles.quickCard} onPress={() => router.push('/trainer-exams' as never)}>
          <MaterialIcons name="fact-check" size={23} color={ucapsaBrand.colors.purpleDark} />
          <Text style={styles.quickTitle}>Exámenes</Text>
          <Text style={styles.quickMeta}>Capturar evaluaciones</Text>
        </Pressable>
        <Pressable style={styles.quickCard} onPress={() => router.push('/trainer-reports' as never)}>
          <MaterialIcons name="table-chart" size={23} color={ucapsaBrand.colors.greenDark} />
          <Text style={styles.quickTitle}>Reportes</Text>
          <Text style={styles.quickMeta}>Mes o rango de fechas</Text>
        </Pressable>
      </View>
    </KeyboardAwareScreen>
  );
}

const styles = StyleSheet.create({
  hero: { borderRadius: 25, backgroundColor: ucapsaBrand.colors.greenDark, padding: 18, marginBottom: 18 },
  kicker: { color: ucapsaBrand.colors.greenSoft, fontSize: 10, fontWeight: '900', letterSpacing: 0.9 },
  title: { color: ucapsaBrand.colors.surface, fontSize: 26, lineHeight: 31, fontWeight: '900', marginTop: 3 },
  subtitle: { color: ucapsaBrand.colors.greenSoft, fontSize: 12, lineHeight: 17, fontWeight: '700', marginTop: 4 },
  tomorrowHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 10 },
  eyebrow: { color: ucapsaBrand.colors.greenDark, fontSize: 9, fontWeight: '900', letterSpacing: 0.8 },
  sectionTitle: { color: ucapsaBrand.colors.text, fontSize: 21, lineHeight: 25, fontWeight: '900', textTransform: 'capitalize', marginTop: 2 },
  totalPill: { alignItems: 'center', borderRadius: 14, backgroundColor: ucapsaBrand.colors.greenSoft, paddingHorizontal: 11, paddingVertical: 7 },
  totalPillValue: { color: ucapsaBrand.colors.greenDark, fontSize: 17, fontWeight: '900' },
  totalPillLabel: { color: ucapsaBrand.colors.greenDark, fontSize: 8, fontWeight: '900' },
  loading: { minHeight: 70, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 },
  muted: { flex: 1, color: ucapsaBrand.colors.muted, fontSize: 11, lineHeight: 16, fontWeight: '700' },
  errorCard: { flexDirection: 'row', alignItems: 'center', gap: 9, borderWidth: 1, borderColor: ucapsaBrand.colors.dangerBorder, backgroundColor: ucapsaBrand.colors.dangerSoft, borderRadius: 17, padding: 12, marginBottom: 10 },
  errorText: { flex: 1, color: ucapsaBrand.colors.danger, fontSize: 11, lineHeight: 16, fontWeight: '800' },
  emptyCard: { alignItems: 'center', gap: 7, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, borderRadius: 20, padding: 18, marginBottom: 12 },
  emptyTitle: { color: ucapsaBrand.colors.text, fontSize: 15, fontWeight: '900' },
  classList: { gap: 9 },
  classCard: { minHeight: 94, flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, borderRadius: 20, padding: 12 },
  classIcon: { width: 45, height: 45, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  classTitleRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 },
  classTitle: { color: ucapsaBrand.colors.text, fontSize: 16, fontWeight: '900' },
  time: { color: ucapsaBrand.colors.greenDark, fontSize: 15, fontWeight: '900' },
  confirmed: { color: ucapsaBrand.colors.text, fontSize: 17, lineHeight: 21, fontWeight: '900', marginTop: 4 },
  classMeta: { color: ucapsaBrand.colors.muted, fontSize: 9, lineHeight: 13, fontWeight: '800', marginTop: 4 },
  levelList: { gap: 3, marginTop: 5 },
  levelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  levelName: { color: ucapsaBrand.colors.text, fontSize: 11, fontWeight: '800' },
  levelCount: { color: ucapsaBrand.colors.purpleDark, fontSize: 12, fontWeight: '900' },
  pendingNotice: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 15, backgroundColor: ucapsaBrand.colors.goldPale, padding: 10, marginTop: 10 },
  pendingText: { flex: 1, color: ucapsaBrand.colors.goldDark, fontSize: 10, lineHeight: 14, fontWeight: '900' },
  quickGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9, marginTop: 18 },
  quickCard: { width: '48%', minHeight: 104, borderRadius: 19, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, padding: 13 },
  quickTitle: { color: ucapsaBrand.colors.text, fontSize: 13, fontWeight: '900', marginTop: 8 },
  quickMeta: { color: ucapsaBrand.colors.muted, fontSize: 9, lineHeight: 13, fontWeight: '700', marginTop: 2 },
});
