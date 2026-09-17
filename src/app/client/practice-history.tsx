import { Redirect, router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { PracticeHistoryRow } from '../../components/domain/PracticeHistoryRow';
import { UcapsaAmbientBackground } from '../../components/layout/UcapsaAmbientBackground';
import { KeyboardAwareScreen } from '../../components/ui/KeyboardAwareScreen';
import { OfflineDataNotice } from '../../components/ui/OfflineDataNotice';
import { ucapsaBrand } from '../../constants/brand';
import { resolveUcapsaFormat } from '../../constants/ucapsaFormats';
import { useSession } from '../../hooks/useSession';
import { getMyPracticeActivity, type PracticeActivitySnapshot } from '../../services/practice.service';

export default function PracticeHistoryScreen() {
  const { user, role, isAdmin } = useSession();
  const [activity, setActivity] = useState<PracticeActivitySnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadRunRef = useRef(0);
  const format = useMemo(() => resolveUcapsaFormat({ user, role, isAdmin }), [isAdmin, role, user]);
  const premium = format.key === 'member';

  const load = useCallback(async () => {
    const runId = loadRunRef.current + 1;
    loadRunRef.current = runId;
    const isCurrentRun = () => loadRunRef.current === runId;
    if (!user || isAdmin) return;

    setError(null);
    try {
      const next = await getMyPracticeActivity(user.id);
      if (!isCurrentRun()) return;
      setActivity(next);
    } catch {
      if (!isCurrentRun()) return;
      setError('No pudimos cargar tu historial de prácticas.');
    } finally {
      if (isCurrentRun()) setLoading(false);
    }
  }, [isAdmin, user]);

  useFocusEffect(useCallback(() => {
    void load();
    return () => { loadRunRef.current += 1; };
  }, [load]));

  async function refresh() {
    setRefreshing(true);
    try { await load(); } finally { setRefreshing(false); }
  }

  if (!user) return <Redirect href="/auth/login" />;
  if (isAdmin) return <Redirect href="/admin-home" />;

  return (
    <KeyboardAwareScreen
      style={{ backgroundColor: format.background }}
      contentContainerStyle={premium ? styles.premiumContent : undefined}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={format.accent} />}
    >
      <UcapsaAmbientBackground format={format} variant="home" />

      {activity && activity.source !== 'remote' ? (
        <OfflineDataNotice savedAt={activity.savedAt} onRetry={() => void refresh()} premium={premium} label="Mostrando prácticas guardadas" />
      ) : null}

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={format.accent} />
          <Text style={[styles.muted, { color: format.muted }]}>Cargando prácticas...</Text>
        </View>
      ) : null}

      {error ? (
        <View style={[styles.stateCard, { borderColor: format.cardBorder, backgroundColor: format.cardBackground }]}>
          <Text style={[styles.stateTitle, { color: format.cardText }]}>{error}</Text>
        </View>
      ) : null}

      {activity ? (
        <>
          <View style={styles.summaryRow}>
            <Text style={[styles.summaryValue, { color: format.text }]}>{activity.entries.length}</Text>
            <Text style={[styles.summaryLabel, { color: premium ? ucapsaBrand.colors.premiumMuted : format.muted }]}>prácticas registradas</Text>
          </View>

          <View style={styles.list}>
            {activity.entries.map((entry) => (
              <PracticeHistoryRow
                key={entry.id}
                entry={entry}
                premium={premium}
                format={format}
                onPress={() => router.push(`/client/practice-detail?practiceId=${encodeURIComponent(entry.id)}` as never)}
              />
            ))}
          </View>

          {activity.entries.length === 0 ? (
            <View style={[styles.stateCard, { borderColor: format.cardBorder, backgroundColor: format.cardBackground }]}>
              <Text style={[styles.stateTitle, { color: format.cardText }]}>Todavía no hay prácticas</Text>
              <Text style={[styles.muted, { color: premium ? ucapsaBrand.colors.premiumMuted : format.muted }]}>Cuando registres una práctica aparecerá aquí.</Text>
            </View>
          ) : null}
        </>
      ) : null}
    </KeyboardAwareScreen>
  );
}

const styles = StyleSheet.create({
  premiumContent: { backgroundColor: ucapsaBrand.colors.premiumBackground },
  loading: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 16 },
  muted: { fontSize: 13, lineHeight: 19, fontWeight: '700' },
  stateCard: { gap: 5, borderWidth: 1, borderRadius: 20, padding: 16 },
  stateTitle: { fontSize: 17, lineHeight: 22, fontWeight: '900' },
  summaryRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginBottom: 12 },
  summaryValue: { fontSize: 28, lineHeight: 31, fontWeight: '900' },
  summaryLabel: { fontSize: 13, lineHeight: 18, fontWeight: '800' },
  list: { gap: 8 },
});
