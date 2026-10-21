import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Redirect, router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { KeyboardAwareScreen } from '../../components/ui/KeyboardAwareScreen';
import { ucapsaBrand } from '../../constants/brand';
import { preregistrationEnabled } from '../../constants/preregistrationFeature';
import { useSession } from '../../hooks/useSession';
import { getProgramClassCancellations } from '../../services/program-cancellations.service';
import { getPrograms, getProgramSchedules } from '../../services/program-schedules.service';
import { isProgramScheduleActiveOnDate, localTodayKey } from '../../services/programs.domain';
import type { ProgramClassCancellation, ProgramSchedule, UcapsaProgram } from '../../types/app.types';
import {
  getStaffClassSummary,
  tomorrowKey,
  type StaffClassSummaryRow,
} from '../../services/trainer-staff.service';

type GroupedClass = {
  scheduleId: string;
  programCode: string;
  programName: string;
  scheduleName: string;
  startTime: string;
  eligibleCount: number;
  confirmedCount: number;
  declinedCount: number;
  noResponseCount: number;
  levels: Array<{ label: string; eligibleCount: number; confirmedCount: number }>;
};

type StaffDayOverview = {
  label: 'HOY' | 'MAÑANA';
  dateKey: string;
  groups: GroupedClass[];
};

function mergeOfficialSchedules(
  rows: StaffClassSummaryRow[], schedules: ProgramSchedule[],
  programs: UcapsaProgram[], cancellations: ProgramClassCancellation[],
  dateKey: string,
): GroupedClass[] {
  const grouped = groupClasses(rows);
  const registered = new Set(grouped.map((r) => r.scheduleId));
  const programsById = new Map(programs.map((p) => [p.id, p]));
  const canceled = new Set(cancellations
    .filter((c) => !c.restored_at && c.cancellation_date === dateKey)
    .map((c) => c.schedule_id));
  for (const schedule of schedules) {
    const program = programsById.get(schedule.program_id);
    if (!program || !program.is_active || !['puppy', 'comandos'].includes(program.code)) continue;
    if (!isProgramScheduleActiveOnDate(schedule, dateKey) || canceled.has(schedule.id)) continue;
    if (registered.has(schedule.id)) continue;
    grouped.push({
      scheduleId: schedule.id, programCode: program.code, programName: program.name,
      scheduleName: schedule.name, startTime: String(schedule.start_time).slice(0, 5),
      eligibleCount: 0, confirmedCount: 0, declinedCount: 0, noResponseCount: 0,
      levels: program.code === 'comandos'
        ? ['Básico','Intermedio','Avanzado'].map((label) => ({
            label, eligibleCount: 0, confirmedCount: 0,
          }))
        : [],
    });
  }
  return grouped.sort((a,b) => a.startTime.localeCompare(b.startTime) ||
    a.programCode.localeCompare(b.programCode));
}

function normalizedLevelLabel(level: string) {
  if (level === 'medio') return 'Intermedio';
  if (level === 'avanzado') return 'Avanzado';
  return 'Básico';
}

function groupClasses(rows: StaffClassSummaryRow[]): GroupedClass[] {
  const grouped = new Map<string, GroupedClass>();
  for (const row of rows) {
    const key = `${row.scheduleId}:${row.startTime}:${row.programCode}`;
    const levelLabel = normalizedLevelLabel(row.programLevel);
    const existing = grouped.get(key);
    if (existing) {
      existing.eligibleCount += row.eligibleCount;
      existing.confirmedCount += row.confirmedCount;
      existing.declinedCount += row.declinedCount;
      existing.noResponseCount += row.noResponseCount;
      if (row.programCode === 'comandos') {
        const level = existing.levels.find((item) => item.label === levelLabel);
        if (level) {
          level.eligibleCount += row.eligibleCount;
          level.confirmedCount += row.confirmedCount;
        } else {
          existing.levels.push({ label: levelLabel, eligibleCount: row.eligibleCount, confirmedCount: row.confirmedCount });
        }
      }
      continue;
    }
    grouped.set(key, {
      scheduleId: row.scheduleId,
      programCode: row.programCode,
      programName: row.programName,
      scheduleName: row.scheduleName,
      startTime: row.startTime,
      eligibleCount: row.eligibleCount,
      confirmedCount: row.confirmedCount,
      declinedCount: row.declinedCount,
      noResponseCount: row.noResponseCount,
      levels: row.programCode === 'comandos'
        ? [{ label: levelLabel, eligibleCount: row.eligibleCount, confirmedCount: row.confirmedCount }]
        : [],
    });
  }

  const levelOrder = new Map([['Básico', 0], ['Intermedio', 1], ['Avanzado', 2]]);
  return [...grouped.values()]
    .map((item) => ({
      ...item,
      levels: [...item.levels].sort((a, b) => (levelOrder.get(a.label) ?? 99) - (levelOrder.get(b.label) ?? 99)),
    }))
    .sort((a, b) => a.startTime.localeCompare(b.startTime) || a.programCode.localeCompare(b.programCode));
}


export default function TrainerHomeTab() {
  const { profile, isAdmin, capabilities } = useSession();
  const [days, setDays] = useState<StaffDayOverview[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const today = localTodayKey();
  const tomorrow = tomorrowKey();
  const firstName = (profile?.full_name || 'Entrenador').trim().split(/\s+/)[0] || 'Entrenador';

  const load = useCallback(async () => {
    if (!capabilities.canUseTrainingWorkspace) return;
    setError(null);
    try {
      const [todayRows, tomorrowRows, todaySchedules, tomorrowSchedules, programs, cancellations] =
        await Promise.all([
          getStaffClassSummary(today), getStaffClassSummary(tomorrow),
          getProgramSchedules(today), getProgramSchedules(tomorrow),
          getPrograms(), getProgramClassCancellations(),
        ]);
      setDays([
        { label: 'HOY', dateKey: today,
          groups: mergeOfficialSchedules(todayRows, todaySchedules, programs, cancellations, today) },
        { label: 'MAÑANA', dateKey: tomorrow,
          groups: mergeOfficialSchedules(tomorrowRows, tomorrowSchedules, programs, cancellations, tomorrow) },
      ]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudieron cargar las clases.');
    } finally {
      setLoading(false);
    }
  }, [capabilities.canUseTrainingWorkspace, today, tomorrow]);

  useFocusEffect(useCallback(() => {
    setLoading(true);
    void load();
    return undefined;
  }, [load]));

  async function refresh() {
    setRefreshing(true);
    try { await load(); } finally { setRefreshing(false); }
  }

  if (!capabilities.canUseTrainingWorkspace) return <Redirect href={isAdmin ? '/admin-home' : '/home'} />;
  if (isAdmin) return <Redirect href="/admin-home" />;

  return (
    <KeyboardAwareScreen refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={ucapsaBrand.colors.red} />}>
      <View style={styles.hero}>
        <View style={{ flex: 1 }}>
          <Text style={styles.kicker}>Entrenador</Text>
          <Text style={styles.title}>Hola, {firstName}</Text>
          <Text style={styles.subtitle}>Lo necesario para operar clases y evaluar perros.</Text>
        </View>
        <Pressable style={styles.profileButton} onPress={() => router.push('/trainer-more' as never)}>
          <MaterialIcons name="person" size={21} color={ucapsaBrand.colors.surface} />
        </Pressable>
      </View>
      {preregistrationEnabled ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Preinscribir persona y perro"
          style={styles.preregistrationShortcut}
          onPress={() => router.push('/staff/preregister-dog' as never)}
        >
          <MaterialIcons name="person-add" size={25} color={ucapsaBrand.colors.surface} />
          <View style={{ flex: 1 }}>
            <Text style={styles.preregistrationShortcutTitle}>Preinscribir</Text>
            <Text style={styles.preregistrationShortcutDetail}>Registrar tutor, perro y programa</Text>
          </View>
          <MaterialIcons name="chevron-right" size={24} color={ucapsaBrand.colors.surface} />
        </Pressable>
      ) : null}


      {loading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={ucapsaBrand.colors.red} />
          <Text style={styles.muted}>Consultando clases de hoy y mañana…</Text>
        </View>
      ) : null}
      {error ? (
        <View style={styles.errorCard}>
          <MaterialIcons name="cloud-off" size={21} color={ucapsaBrand.colors.danger} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      {!loading && !error ? days.map(({ label, dateKey, groups }) => (
        <View key={dateKey}>
          <View style={styles.sectionHeader}>
            <View>
              <Text style={styles.sectionEyebrow}>{label}</Text>
              <Text style={styles.sectionTitle}>Quién esperamos</Text>
            </View>
            <View style={styles.datePill}>
              <MaterialIcons name="event" size={15} color={ucapsaBrand.colors.redDark} />
              <Text style={styles.dateText}>{dateKey}</Text>
            </View>
          </View>
          {groups.length === 0 ? (
            <View style={styles.emptyCard}>
              <MaterialIcons name="event-busy" size={24} color={ucapsaBrand.colors.muted} />
              <Text style={styles.emptyTitle}>{label === 'HOY' ? 'No hay horarios programados hoy' : 'No hay horarios programados mañana'}</Text>
            </View>
          ) : null}
          <View style={styles.classList}>
            {groups.map((item) => {
              const commands = item.programCode === 'comandos';
              const puppy = item.programCode === 'puppy';
              return (
                <Pressable
                  key={dateKey + ':' + item.scheduleId + ':' + item.startTime}
                  style={[styles.classCard, puppy ? styles.puppyCard : styles.commandsCard]}
                  onPress={() => router.push(('/trainer-classes?date=' + encodeURIComponent(dateKey) + '&scheduleId=' + encodeURIComponent(item.scheduleId)) as never)}
                >
                  <View style={[styles.classIcon, { backgroundColor: puppy ? ucapsaBrand.colors.goldPale : ucapsaBrand.colors.purpleSoft }]}>
                    <MaterialIcons name={puppy ? 'pets' : 'school'} size={22} color={puppy ? ucapsaBrand.colors.goldDark : ucapsaBrand.colors.purpleDark} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={styles.classTitleRow}>
                      <Text style={styles.classTitle}>{puppy ? 'Puppy' : 'Comandos'}</Text>
                      <Text style={styles.classTime}>{item.startTime}</Text>
                    </View>
                    <Text style={styles.confirmedText}>{item.confirmedCount} / {item.eligibleCount} confirmados</Text>
                    {commands ? (
                      <Text style={styles.levelsText}>
                        {item.levels.map((level) => level.label + ' ' + level.confirmedCount + '/' + level.eligibleCount).join(' · ')}
                      </Text>
                    ) : null}
                    {item.eligibleCount === 0
                      ? <Text style={styles.metaText}>Sin perros inscritos aún</Text>
                      : <Text style={styles.metaText}>{item.declinedCount} no irá · {item.noResponseCount} sin responder</Text>}
                  </View>
                  <MaterialIcons name="chevron-right" size={23} color={ucapsaBrand.colors.redDark} />
                </Pressable>
              );
            })}
          </View>
        </View>
      )) : null}

      <View style={styles.quickGrid}>
        <QuickAction icon="groups" title="Clases" subtitle="Roster y asistencia" onPress={() => router.push('/trainer-classes' as never)} />
        <QuickAction icon="assignment" title="Exámenes" subtitle="Capturar resultados" onPress={() => router.push('/trainer-exams' as never)} />
        <QuickAction icon="table-view" title="Reporte Excel" subtitle="Mes o rango" onPress={() => router.push('/staff/training-report' as never)} />
      </View>
    </KeyboardAwareScreen>
  );
}

function QuickAction({ icon, title, subtitle, onPress }: { icon: keyof typeof MaterialIcons.glyphMap; title: string; subtitle: string; onPress: () => void }) {
  return (
    <Pressable style={styles.quickCard} onPress={onPress}>
      <View style={styles.quickIcon}><MaterialIcons name={icon} size={21} color={ucapsaBrand.colors.redDark} /></View>
      <Text style={styles.quickTitle}>{title}</Text>
      <Text style={styles.quickSubtitle}>{subtitle}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  preregistrationShortcut: {
    flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 72,
    borderRadius: 20, backgroundColor: ucapsaBrand.colors.greenDark,
    paddingHorizontal: 16, paddingVertical: 12, marginBottom: 18,
  },
  preregistrationShortcutTitle: { color: ucapsaBrand.colors.surface, fontSize: 17, fontWeight: '900' },
  preregistrationShortcutDetail: { color: ucapsaBrand.colors.surface, fontSize: 11, marginTop: 2, fontWeight: '700' },

  hero: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: ucapsaBrand.colors.red, borderRadius: 26, padding: 18, marginBottom: 18 },
  kicker: { color: ucapsaBrand.colors.redSoftStrong, fontSize: 11, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.7 },
  title: { color: ucapsaBrand.colors.surface, fontSize: 27, lineHeight: 32, fontWeight: '900' },
  subtitle: { color: ucapsaBrand.colors.redSoft, fontSize: 12, lineHeight: 17, fontWeight: '700', marginTop: 2 },
  profileButton: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: ucapsaBrand.colors.redDark },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 10 },
  sectionEyebrow: { color: ucapsaBrand.colors.redDark, fontSize: 10, fontWeight: '900', letterSpacing: 0.8 },
  sectionTitle: { color: ucapsaBrand.colors.text, fontSize: 21, fontWeight: '900', marginTop: 2 },
  datePill: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 999, backgroundColor: ucapsaBrand.colors.redSoft, paddingHorizontal: 9, paddingVertical: 6 },
  dateText: { color: ucapsaBrand.colors.redDark, fontSize: 10, fontWeight: '900' },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 14 },
  muted: { color: ucapsaBrand.colors.muted, fontSize: 12, fontWeight: '700' },
  errorCard: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 16, borderWidth: 1, borderColor: ucapsaBrand.colors.dangerBorder, backgroundColor: ucapsaBrand.colors.dangerSoft, padding: 12, marginBottom: 10 },
  errorText: { flex: 1, color: ucapsaBrand.colors.danger, fontSize: 11, lineHeight: 16, fontWeight: '800' },
  emptyCard: { alignItems: 'center', gap: 7, borderRadius: 18, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, padding: 20 },
  emptyTitle: { color: ucapsaBrand.colors.text, fontSize: 15, fontWeight: '900' },
  classList: { gap: 9, marginBottom: 16 },
  classCard: { minHeight: 92, flexDirection: 'row', alignItems: 'center', gap: 11, borderRadius: 20, borderWidth: 1, padding: 13 },
  puppyCard: { borderColor: ucapsaBrand.colors.gold, backgroundColor: ucapsaBrand.colors.goldPale },
  commandsCard: { borderColor: ucapsaBrand.colors.purple, backgroundColor: ucapsaBrand.colors.purpleSoft },
  classIcon: { width: 44, height: 44, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  classTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  classTitle: { color: ucapsaBrand.colors.text, fontSize: 15, fontWeight: '900' },
  classTime: { color: ucapsaBrand.colors.text, fontSize: 13, fontWeight: '900' },
  confirmedText: { color: ucapsaBrand.colors.text, fontSize: 17, lineHeight: 21, fontWeight: '900', marginTop: 2 },
  levelsText: { color: ucapsaBrand.colors.purpleDark, fontSize: 10, lineHeight: 14, fontWeight: '900', marginTop: 3 },
  metaText: { color: ucapsaBrand.colors.muted, fontSize: 10, lineHeight: 14, fontWeight: '800', marginTop: 2 },
  quickGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  quickCard: { width: '48%', minHeight: 112, borderRadius: 19, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, padding: 13 },
  quickIcon: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: ucapsaBrand.colors.redSoft, marginBottom: 7 },
  quickTitle: { color: ucapsaBrand.colors.text, fontSize: 14, fontWeight: '900' },
  quickSubtitle: { color: ucapsaBrand.colors.muted, fontSize: 10, lineHeight: 14, fontWeight: '700', marginTop: 2 },
});
