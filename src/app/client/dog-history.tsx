import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Redirect, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { UcapsaAmbientBackground } from '../../components/layout/UcapsaAmbientBackground';
import { KeyboardAwareScreen } from '../../components/ui/KeyboardAwareScreen';
import { OfflineDataNotice } from '../../components/ui/OfflineDataNotice';
import { ucapsaBrand } from '../../constants/brand';
import { resolveUcapsaFormat } from '../../constants/ucapsaFormats';
import { useSession } from '../../hooks/useSession';
import { clientReadKeys, readClientResource, sanitizeProgramRowsForCache, writeClientResource } from '../../services/client-read-cache.service';
import { getMyProgramEnrollments, getProgramCodeLabel, getProgramEnrollmentDogName, getProgramLevelDisplayLabel } from '../../services/programs.service';
import type { ProgramEnrollmentWithDetails } from '../../types/app.types';
import { DEFAULT_READ_TIMEOUT_MS, withOperationTimeout } from '../../utils/async.utils';

function getParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? '' : value ?? '';
}

export default function DogHistoryScreen() {
  const { dogId: dogIdParam } = useLocalSearchParams<{ dogId?: string | string[] }>();
  const dogId = getParam(dogIdParam).trim();
  const { user, role, isAdmin } = useSession();
  const format = useMemo(() => resolveUcapsaFormat({ user, role, isAdmin }), [isAdmin, role, user]);
  const premium = format.key === 'member';
  const [rows, setRows] = useState<ProgramEnrollmentWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [usingSavedData, setUsingSavedData] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user || isAdmin) return;
    const cached = await readClientResource<ProgramEnrollmentWithDetails[]>(user.id, clientReadKeys.programs);
    if (cached) {
      setRows(cached.data);
      setSavedAt(cached.saved_at);
      setLoading(false);
    }
    try {
      const fresh = await withOperationTimeout(getMyProgramEnrollments(), DEFAULT_READ_TIMEOUT_MS, 'dog-history');
      setRows(fresh);
      const stored = await writeClientResource(user.id, clientReadKeys.programs, sanitizeProgramRowsForCache(fresh));
      setSavedAt(stored.saved_at);
      setUsingSavedData(false);
    } catch {
      setUsingSavedData(Boolean(cached));
    } finally {
      setLoading(false);
    }
  }, [isAdmin, user]);

  useFocusEffect(useCallback(() => { void load(); return undefined; }, [load]));

  const dogRows = useMemo(
    () => rows
      .filter((row) => row.enrollment.dog_id === dogId)
      .sort((a, b) => b.enrollment.created_at.localeCompare(a.enrollment.created_at)),
    [dogId, rows],
  );
  const dogName = dogRows[0] ? getProgramEnrollmentDogName(dogRows[0]) : 'Tu perro';

  async function refresh() {
    setRefreshing(true);
    try { await load(); } finally { setRefreshing(false); }
  }

  if (!user) return <Redirect href="/auth/login" />;
  if (isAdmin) return <Redirect href="/admin-home" />;

  return (
    <KeyboardAwareScreen
      backgroundColor={format.background}
      style={{ backgroundColor: format.background }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={format.accent} />}
    >
      <UcapsaAmbientBackground format={format} variant="dog" />

      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="Volver a Mis perros" style={[styles.back, { borderColor: format.cardBorder, backgroundColor: format.cardBackground }]} onPress={() => router.back()}>
          <MaterialIcons name="arrow-back" size={22} color={premium ? ucapsaBrand.colors.premiumAction : format.accentDark} />
        </Pressable>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[styles.eyebrow, { color: premium ? ucapsaBrand.colors.premiumAction : format.accentDark }]}>HISTORIAL</Text>
          <Text style={[styles.title, { color: format.cardText }]}>{dogName}</Text>
          <Text style={[styles.subtitle, { color: premium ? ucapsaBrand.colors.premiumMuted : format.muted }]}>Programas y clases registradas.</Text>
        </View>
      </View>

      {usingSavedData ? <OfflineDataNotice savedAt={savedAt} onRetry={() => void refresh()} premium={premium} /> : null}
      {loading ? <View style={styles.loading}><ActivityIndicator color={format.accent} /><Text style={[styles.subtitle, { color: format.muted }]}>Cargando historial…</Text></View> : null}

      {!loading && dogRows.length === 0 ? (
        <View style={[styles.empty, { borderColor: format.cardBorder, backgroundColor: format.cardBackground }]}>
          <MaterialIcons name="history" size={24} color={format.muted} />
          <Text style={[styles.cardTitle, { color: format.cardText }]}>Sin historial todavía</Text>
          <Text style={[styles.subtitle, { color: format.muted }]}>Cuando haya clases o programas registrados aparecerán aquí.</Text>
        </View>
      ) : null}

      <View style={styles.list}>
        {dogRows.map((item) => {
          const level = getProgramLevelDisplayLabel(item.program.code, item.enrollment.program_level);
          const title = `${getProgramCodeLabel(item.program.code)}${level ? ` ${level}` : ''}`;
          const status = item.enrollment.status === 'active'
            ? 'Actual'
            : item.enrollment.status === 'completed'
              ? 'Completado'
              : 'Finalizado';
          return (
            <Pressable
              key={item.enrollment.id}
              accessibilityRole="button"
              style={[styles.row, { borderColor: format.cardBorder, backgroundColor: format.cardBackground }]}
              onPress={() => router.push(`/client/class-detail?enrollmentId=${encodeURIComponent(item.enrollment.id)}` as never)}
            >
              <View style={[styles.icon, { backgroundColor: format.accentSoft }]}>
                <MaterialIcons name="school" size={20} color={premium ? ucapsaBrand.colors.premiumAction : format.accentDark} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[styles.cardTitle, { color: format.cardText }]}>{title}</Text>
                <Text style={[styles.subtitle, { color: format.muted }]}>{item.attendances.length} clase{item.attendances.length === 1 ? '' : 's'} registrada{item.attendances.length === 1 ? '' : 's'} · {status}</Text>
              </View>
              <MaterialIcons name="chevron-right" size={21} color={premium ? ucapsaBrand.colors.premiumAction : format.accentDark} />
            </Pressable>
          );
        })}
      </View>
    </KeyboardAwareScreen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 11, marginBottom: 16 },
  back: { width: 46, height: 46, borderRadius: 15, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  eyebrow: { fontSize: 9, lineHeight: 12, fontWeight: '900', letterSpacing: 0.9 },
  title: { marginTop: 2, fontSize: 25, lineHeight: 30, fontWeight: '900' },
  subtitle: { marginTop: 2, fontSize: 11, lineHeight: 16, fontWeight: '700' },
  loading: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 18 },
  empty: { alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 20, padding: 18 },
  list: { gap: 9 },
  row: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 18, padding: 12 },
  icon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontSize: 14, lineHeight: 19, fontWeight: '900' },
});
