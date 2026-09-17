import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Redirect, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { UcapsaAmbientBackground } from '../../components/layout/UcapsaAmbientBackground';
import { KeyboardAwareScreen } from '../../components/ui/KeyboardAwareScreen';
import { OfflineDataNotice } from '../../components/ui/OfflineDataNotice';
import { ucapsaBrand } from '../../constants/brand';
import { resolveUcapsaFormat } from '../../constants/ucapsaFormats';
import { useSession } from '../../hooks/useSession';
import { getMyPracticeActivity, type PracticeActivityEntry, type PracticeActivitySnapshot } from '../../services/practice.service';
import { formatPracticeDate, practiceDifficultyLabel } from '../../utils/practicePresentation';

export default function PracticeDetailScreen() {
  const { practiceId: practiceIdParam } = useLocalSearchParams<{ practiceId?: string | string[] }>();
  const practiceId = Array.isArray(practiceIdParam) ? practiceIdParam[0] ?? null : practiceIdParam ?? null;
  const { user, role, isAdmin } = useSession();
  const [entry, setEntry] = useState<PracticeActivityEntry | null>(null);
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
      const found = practiceId ? next.entries.find((item) => item.id === practiceId) ?? null : null;
      setEntry(found);
      if (!found) setError('No encontramos esta práctica en tu historial guardado.');
    } catch {
      if (!isCurrentRun()) return;
      setEntry(null);
      setError('No pudimos cargar esta práctica.');
    } finally {
      if (isCurrentRun()) setLoading(false);
    }
  }, [isAdmin, practiceId, user]);

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
        <OfflineDataNotice savedAt={activity.savedAt} onRetry={() => void refresh()} premium={premium} label="Mostrando práctica guardada" />
      ) : null}

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={format.accent} />
          <Text style={[styles.muted, { color: format.muted }]}>Cargando práctica...</Text>
        </View>
      ) : null}

      {error && !entry ? (
        <View style={[styles.stateCard, { borderColor: format.cardBorder, backgroundColor: format.cardBackground }]}>
          <Text style={[styles.stateTitle, { color: format.cardText }]}>{error}</Text>
        </View>
      ) : null}

      {entry ? (
        <View style={[styles.detailCard, { borderColor: format.cardBorder, backgroundColor: format.cardBackground }]}>
          <View style={styles.detailHeader}>
            <View style={[styles.detailIcon, { backgroundColor: format.pillBackground }]}>
              <MaterialIcons name="pets" size={22} color={format.pillText} />
            </View>
            <View style={styles.detailCopy}>
              <Text style={[styles.eyebrow, { color: premium ? ucapsaBrand.colors.premiumActionText : format.accentDark }]}>PRÁCTICA REGISTRADA</Text>
              <Text style={[styles.title, { color: format.cardText }]}>{entry.dogName || 'Tu perro'}</Text>
            </View>
          </View>

          <View style={[styles.summary, { borderColor: format.cardBorder, backgroundColor: format.secondaryButton }]}>
            <View style={styles.metric}>
              <Text style={[styles.label, { color: premium ? ucapsaBrand.colors.premiumMuted : format.muted }]}>FECHA</Text>
              <Text style={[styles.value, { color: format.cardText }]}>{formatPracticeDate(entry.completedAt)}</Text>
            </View>
            <View style={styles.metric}>
              <Text style={[styles.label, { color: premium ? ucapsaBrand.colors.premiumMuted : format.muted }]}>RESULTADO</Text>
              <Text style={[styles.value, { color: format.cardText }]}>{practiceDifficultyLabel(entry.difficulty)}</Text>
            </View>
          </View>

          <View style={styles.noteWrap}>
            <Text style={[styles.label, { color: premium ? ucapsaBrand.colors.premiumMuted : format.muted }]}>COMENTARIO</Text>
            <Text style={[styles.note, { color: format.cardText }]}>{entry.note?.trim() || 'Sin comentario.'}</Text>
          </View>

          {entry.syncStatus === 'pending' ? (
            <View style={[styles.pending, { borderColor: format.cardBorder, backgroundColor: format.secondaryButton }]}>
              <MaterialIcons name="sync" size={18} color={premium ? ucapsaBrand.colors.premiumAction : format.accentDark} />
              <Text style={[styles.pendingText, { color: premium ? ucapsaBrand.colors.premiumMuted : format.muted }]}>Guardada en este dispositivo. Se sincronizará cuando vuelva la conexión.</Text>
            </View>
          ) : null}
        </View>
      ) : null}
    </KeyboardAwareScreen>
  );
}

const styles = StyleSheet.create({
  premiumContent: { backgroundColor: ucapsaBrand.colors.premiumBackground },
  loading: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 16 },
  muted: { fontSize: 13, lineHeight: 19, fontWeight: '700' },
  stateCard: { borderWidth: 1, borderRadius: 20, padding: 16 },
  stateTitle: { fontSize: 17, lineHeight: 22, fontWeight: '900' },
  detailCard: { gap: 16, borderWidth: 1, borderRadius: 24, padding: 16 },
  detailHeader: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  detailIcon: { width: 44, height: 44, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  detailCopy: { flex: 1, minWidth: 0 },
  eyebrow: { fontSize: 11, lineHeight: 15, fontWeight: '900', letterSpacing: 0.7 },
  title: { marginTop: 2, fontSize: 22, lineHeight: 27, fontWeight: '900' },
  summary: { flexDirection: 'row', gap: 10, borderWidth: 1, borderRadius: 18, padding: 13 },
  metric: { flex: 1, gap: 4 },
  label: { fontSize: 10, lineHeight: 14, fontWeight: '900', letterSpacing: 0.7 },
  value: { fontSize: 14, lineHeight: 19, fontWeight: '900' },
  noteWrap: { gap: 6 },
  note: { fontSize: 15, lineHeight: 22, fontWeight: '700' },
  pending: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderWidth: 1, borderRadius: 16, padding: 12 },
  pendingText: { flex: 1, fontSize: 12, lineHeight: 18, fontWeight: '700' },
});
