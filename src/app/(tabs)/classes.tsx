import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Redirect, router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { UcapsaAmbientBackground } from '../../components/layout/UcapsaAmbientBackground';
import { ClientPageHeader } from '../../components/layout/ClientPageHeader';
import { KeyboardAwareScreen } from '../../components/ui/KeyboardAwareScreen';
import { OfflineDataNotice } from '../../components/ui/OfflineDataNotice';
import { resolveUcapsaFormat } from '../../constants/ucapsaFormats';
import { ucapsaBrand, withAlpha } from '../../constants/brand';
import { useSession } from '../../hooks/useSession';
import {
  getMyProgramEnrollments,
  getNextProgramScheduleDate,
  getProgramCodeLabel,
  getProgramEnrollmentDogName,
  getProgramLevelDisplayLabel,
  getProgramStatusLabel,
} from '../../services/programs.service';
import { clientReadKeys, readClientResource, sanitizeProgramRowsForCache, writeClientResource } from '../../services/client-read-cache.service';
import { DEFAULT_READ_TIMEOUT_MS, withOperationTimeout } from '../../utils/async.utils';
import type { ProgramEnrollmentWithDetails } from '../../types/app.types';

const dayNames = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const monthNames = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function nextClassLabel(item: ProgramEnrollmentWithDetails) {
  const date = getNextProgramScheduleDate(item.schedule);
  if (!date) return 'Próxima clase por confirmar';
  const time = String(item.schedule.start_time ?? '').slice(0, 5);
  return `${dayNames[date.getDay()]} ${String(date.getDate()).padStart(2, '0')} ${monthNames[date.getMonth()]}${time ? `, ${time}` : ''}`;
}

function scheduleLabel(item: ProgramEnrollmentWithDetails) {
  const repeat = item.schedule.repeat_type === 'biweekly' ? 'Cada 2 semanas' : 'Cada semana';
  const time = String(item.schedule.start_time ?? '').slice(0, 5);
  return `${dayNames[item.schedule.day_of_week] ?? 'Día'} ${time || '--:--'} - ${repeat}`;
}

export default function ClassesTab() {
  const { user, role, isAdmin } = useSession();
  const [rows, setRows] = useState<ProgramEnrollmentWithDetails[]>([]);
  const [localReady, setLocalReady] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [usingSavedData, setUsingSavedData] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [offlineEmpty, setOfflineEmpty] = useState(false);

  const load = useCallback(async () => {
    if (!user || isAdmin) return;
    setUsingSavedData(false);
    setOfflineEmpty(false);

    const cached = await readClientResource<ProgramEnrollmentWithDetails[]>(user.id, clientReadKeys.programs);
    if (cached) {
      setRows(cached.data);
      setSavedAt(cached.saved_at);
    }
    setLocalReady(true);

    try {
      const fresh = await withOperationTimeout(getMyProgramEnrollments(), DEFAULT_READ_TIMEOUT_MS, 'programs');
      setRows(fresh);
      const stored = await writeClientResource(user.id, clientReadKeys.programs, sanitizeProgramRowsForCache(fresh));
      setSavedAt(stored.saved_at);
      setUsingSavedData(false);
      setOfflineEmpty(false);
    } catch {
      if (cached) setUsingSavedData(true);
      else setOfflineEmpty(true);
    }
  }, [isAdmin, user]);

  useFocusEffect(useCallback(() => { void load(); return undefined; }, [load]));

  const active = useMemo(() => rows.filter((item) => item.enrollment.status === 'active'), [rows]);
  const previous = useMemo(() => rows.filter((item) => item.enrollment.status !== 'active'), [rows]);
  const format = useMemo(() => resolveUcapsaFormat({ user, role, isAdmin, hasActivePrograms: active.length > 0 }), [active.length, isAdmin, role, user]);
  const premium = format.key === 'member';

  async function refresh() {
    setRefreshing(true);
    try { await load(); } finally { setRefreshing(false); }
  }

  if (!user) return <Redirect href="/auth/login" />;
  if (isAdmin) return <Redirect href="/admin-classes" />;

  return (
    <KeyboardAwareScreen
      backgroundColor={format.background}
      style={{ backgroundColor: format.background }}
      contentContainerStyle={[styles.screenContent, premium && styles.premiumContent]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={format.accent} />}
    >
      <UcapsaAmbientBackground format={format} variant="classes" />
      <ClientPageHeader
        format={format}
        eyebrow="Tu entrenamiento"
        title="Clases"
        subtitle="Próximas sesiones, asistencias y programas anteriores."
        icon="school"
      />

      {usingSavedData ? <OfflineDataNotice savedAt={savedAt} onRetry={() => void refresh()} premium={premium} label="Mostrando clases guardadas" /> : null}

      {localReady && rows.length === 0 ? (
        <View style={[styles.emptyCard, { borderColor: format.cardBorder, backgroundColor: format.cardBackground }]}>
          <MaterialIcons name={offlineEmpty ? 'cloud-off' : 'school'} size={32} color={offlineEmpty ? format.accentDark : format.accent} />
          <Text style={[styles.sectionTitle, { color: format.cardText }]}>
            {offlineEmpty ? 'Clases aún no guardadas' : 'Sin clases activas'}
          </Text>
          <Text style={[styles.muted, { color: format.muted }]}>
            {offlineEmpty
              ? 'La app funciona sin conexión después de la primera sincronización. Conéctate una vez para guardar tus clases y asistencias en este dispositivo.'
              : 'Cuando tengas una inscripción activa de Puppy o Comandos aparecerá aquí.'}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={offlineEmpty ? 'Reintentar sincronización de clases' : 'Ver servicios'}
            style={[styles.secondaryButton, { borderColor: format.cardBorder, backgroundColor: format.secondaryButton }]}
            onPress={offlineEmpty ? () => void refresh() : () => router.push('/services' as never)}
          >
            <Text style={[styles.secondaryButtonText, { color: format.secondaryButtonText }]}>{offlineEmpty ? 'Reintentar' : 'Ver servicios'}</Text>
          </Pressable>
        </View>
      ) : null}

      {active.length > 0 ? (
        <>
          <View style={styles.currentHeader}>
            <View>
              <Text style={[styles.currentEyebrow, { color: premium ? ucapsaBrand.colors.premiumAction : format.accentDark }]}>TU PROGRAMA ACTUAL</Text>
              <Text style={[styles.sectionTitle, { color: format.text }]}>Lo que viene y lo que has usado</Text>
            </View>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Registrar asistencia"
            style={[styles.scanWideButton, { backgroundColor: format.primaryButton }]}
            onPress={() => router.push('/attendance' as never)}
          >
            <MaterialIcons name="qr-code-scanner" size={20} color={format.primaryButtonText} />
            <Text style={[styles.scanWideText, { color: format.primaryButtonText }]}>Registrar asistencia</Text>
          </Pressable>
        </>
      ) : null}
      {active.map((item) => <ClassCard key={item.enrollment.id} item={item} premium={premium} format={format} />)}

      {previous.length > 0 ? (
        <View style={styles.historySection}>
          <Text style={[styles.sectionTitle, { color: format.text }]}>Anteriores</Text>
          {previous.slice(0, 4).map((item) => <ClassCard key={item.enrollment.id} item={item} compact premium={premium} format={format} />)}
          {previous.length > 4 ? <Text style={[styles.muted, { color: format.muted }]}>Se muestran las 4 más recientes.</Text> : null}
        </View>
      ) : null}
    </KeyboardAwareScreen>
  );
}

function ClassCard({ item, compact = false, premium, format }: { item: ProgramEnrollmentWithDetails; compact?: boolean; premium: boolean; format: ReturnType<typeof resolveUcapsaFormat> }) {
  const attendanceCount = item.attendances.length;
  const required = item.program.required_attendances;
  const remaining = required > 0 ? Math.max(0, required - attendanceCount) : null;
  const levelLabel = getProgramLevelDisplayLabel(item.program.code, item.enrollment.program_level);
  const statusLabel = getProgramStatusLabel(item.enrollment.status);
  const dogName = getProgramEnrollmentDogName(item);
  const classLabel = `${getProgramCodeLabel(item.program.code)}${levelLabel ? ` ${levelLabel}` : ''} con ${dogName}`;

  if (compact) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Abrir ${classLabel}`}
        style={[styles.historyCard, { borderColor: format.cardBorder, backgroundColor: format.cardBackground }]}
        onPress={() => router.push(`/client/class-detail?enrollmentId=${encodeURIComponent(item.enrollment.id)}` as never)}
      >
        <View style={[styles.historyIcon, { backgroundColor: format.pillBackground }]}><MaterialIcons name="history" size={19} color={format.pillText} /></View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[styles.historyTitle, { color: format.cardText }]}>{getProgramCodeLabel(item.program.code)}{levelLabel ? ` · ${levelLabel}` : ''}</Text>
          <Text style={[styles.cardMeta, { color: premium ? ucapsaBrand.colors.premiumMuted : format.muted }]}>{dogName} · {statusLabel} · {attendanceCount} asistencias</Text>
        </View>
        <MaterialIcons name="chevron-right" size={22} color={premium ? ucapsaBrand.colors.premiumAction : format.accentDark} />
      </Pressable>
    );
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Abrir ${classLabel}`}
      style={[styles.currentCard, { borderColor: format.cardBorder, backgroundColor: format.cardBackground }]}
      onPress={() => router.push(`/client/class-detail?enrollmentId=${encodeURIComponent(item.enrollment.id)}` as never)}
    >
      <View style={styles.currentCardTop}>
        <View style={[styles.programIconLarge, { backgroundColor: format.pillBackground }]}><MaterialIcons name="school" size={25} color={format.pillText} /></View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[styles.currentProgram, { color: format.cardText }]}>{getProgramCodeLabel(item.program.code)}{levelLabel ? ` ${levelLabel}` : ''}</Text>
          <Text style={[styles.currentDog, { color: premium ? ucapsaBrand.colors.premiumMuted : format.muted }]}>Con {dogName}</Text>
        </View>
        {!premium && remaining != null ? (
          <View style={[styles.remainingBox, { backgroundColor: format.accent }]}>
            <Text style={[styles.remainingNumber, { color: format.primaryButtonText }]}>{remaining}</Text>
            <Text style={[styles.remainingText, { color: format.primaryButtonText }]}>clases restantes</Text>
          </View>
        ) : premium ? <View style={[styles.memberMark, { backgroundColor: ucapsaBrand.colors.premiumSurfaceAlt, borderColor: ucapsaBrand.colors.premiumBorder }]}><MaterialIcons name="workspace-premium" size={19} color={ucapsaBrand.colors.premiumAction} /></View> : null}
      </View>

      <View style={[styles.nextSession, { borderColor: format.border, backgroundColor: format.surfaceAlt }]}>
        <View style={[styles.nextSessionIcon, { backgroundColor: format.pillBackground }]}><MaterialIcons name="event" size={19} color={format.pillText} /></View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[styles.nextSessionLabel, { color: premium ? ucapsaBrand.colors.premiumAction : format.accentDark }]}>PRÓXIMA SESIÓN</Text>
          <Text style={[styles.nextClass, { color: format.cardText }]}>{nextClassLabel(item)}</Text>
          <Text style={[styles.scheduleText, { color: premium ? ucapsaBrand.colors.premiumMuted : format.muted }]}>{scheduleLabel(item)}</Text>
        </View>
      </View>

      <View style={styles.usageRow}>
        <View style={styles.usageCopy}>
          <Text style={[styles.usageValue, { color: format.cardText }]}>{attendanceCount}</Text>
          <Text style={[styles.usageLabel, { color: premium ? ucapsaBrand.colors.premiumMuted : format.muted }]}>asistencias registradas</Text>
        </View>
        <View style={[styles.detailButton, { backgroundColor: format.secondaryButton, borderColor: format.cardBorder }]}>
          <Text style={[styles.detailButtonText, { color: format.secondaryButtonText }]}>Ver programa</Text>
          <MaterialIcons name="arrow-forward" size={18} color={format.secondaryButtonText} />
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screenContent: { position: 'relative' },
  premiumContent: { backgroundColor: ucapsaBrand.colors.premiumBackground },
  currentHeader: { marginBottom: 8 },
  currentEyebrow: { fontSize: 11, lineHeight: 15, fontWeight: '900', letterSpacing: 0.9, marginBottom: 2 },
  scanWideButton: { width: '100%', minHeight: 48, borderRadius: 16, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 12 },
  scanWideText: { fontSize: 14, lineHeight: 19, fontWeight: '900' },
  currentCard: { gap: 13, borderRadius: 28, borderWidth: 1, padding: 16, marginBottom: 14 },
  currentCardTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  programIconLarge: { width: 50, height: 50, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  currentProgram: { fontSize: 20, lineHeight: 25, fontWeight: '900', letterSpacing: -0.25 },
  currentDog: { fontSize: 13, lineHeight: 18, fontWeight: '800', marginTop: 2 },
  remainingBox: { width: 86, minHeight: 72, borderRadius: 20, padding: 8, alignItems: 'center', justifyContent: 'center' },
  remainingNumber: { fontSize: 27, lineHeight: 30, fontWeight: '900' },
  remainingText: { textAlign: 'center', fontSize: 11, lineHeight: 14, fontWeight: '900' },
  memberMark: { width: 48, height: 48, borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  nextSession: { flexDirection: 'row', alignItems: 'center', gap: 11, borderRadius: 20, borderWidth: 1, padding: 13 },
  nextSessionIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  nextSessionLabel: { fontSize: 11, lineHeight: 15, fontWeight: '900', letterSpacing: 0.8 },
  scheduleText: { fontSize: 12, lineHeight: 17, fontWeight: '700', marginTop: 2 },
  usageRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  usageCopy: { flex: 1, minWidth: 0 },
  usageValue: { fontSize: 22, lineHeight: 26, fontWeight: '900' },
  usageLabel: { fontSize: 12, lineHeight: 17, fontWeight: '800' },
  detailButton: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 14, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 9 },
  detailButtonText: { fontSize: 12, lineHeight: 16, fontWeight: '900' },
  historyCard: { minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 19, borderWidth: 1, padding: 13, marginBottom: 9 },
  historyIcon: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  historyTitle: { fontSize: 15, lineHeight: 20, fontWeight: '900' },
  muted: { fontSize: 14, lineHeight: 20, fontWeight: '700' },
  emptyCard: { gap: 10, alignItems: 'flex-start', borderRadius: 20, borderWidth: 1, padding: 18 },
  sectionTitle: { fontSize: 19, lineHeight: 24, fontWeight: '900', marginBottom: 9 },
  secondaryButton: { minHeight: 48, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center', borderRadius: 15, borderWidth: 1, paddingVertical: 11, marginTop: 3 },
  secondaryButtonText: { fontSize: 14, lineHeight: 19, fontWeight: '900' },
  cardMeta: { fontSize: 12, lineHeight: 17, fontWeight: '800', marginTop: 2 },
  nextClass: { fontSize: 15, lineHeight: 20, fontWeight: '900' },
  historySection: { marginTop: 10 },
  progressTrackPremium: { backgroundColor: withAlpha(ucapsaBrand.colors.surface, 0.14) },
});
