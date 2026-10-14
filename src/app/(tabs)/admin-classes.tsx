import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Redirect, router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { KeyboardAwareScreen } from '../../components/ui/KeyboardAwareScreen';
import { ucapsaBrand } from '../../constants/brand';
import { useSession } from '../../hooks/useSession';
import { getAdminProgramRows } from '../../services/programs.service';
import { isTrainingDecisionReady } from '../../services/admin-training-decisions.service';
import { DEFAULT_READ_TIMEOUT_MS, friendlyReadError, withOperationTimeout } from '../../utils/async.utils';

type ClassStats = { puppy: number; comandos: number; ready: number };
const emptyStats: ClassStats = { puppy: 0, comandos: 0, ready: 0 };

export default function AdminClassesTab() {
  const { isAdmin } = useSession();
  const [stats, setStats] = useState<ClassStats>(emptyStats);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasData, setHasData] = useState(false);

  const load = useCallback(async () => {
    if (!isAdmin) return;
    setError(null);
    const rows = await withOperationTimeout(getAdminProgramRows(), DEFAULT_READ_TIMEOUT_MS, 'admin-classes-load');
    setStats({
      puppy: rows.filter((row) => row.enrollment.status === 'active' && row.program.code === 'puppy').length,
      comandos: rows.filter((row) => row.enrollment.status === 'active' && row.program.code === 'comandos').length,
      ready: rows.filter(isTrainingDecisionReady).length,
    });
    setHasData(true);
  }, [isAdmin]);

  useFocusEffect(useCallback(() => {
    if (!isAdmin) return undefined;
    setLoading(true);
    void load().catch(() => { setHasData(false); setError(friendlyReadError('No se pudo actualizar el resumen de clases.')); }).finally(() => setLoading(false));
    return undefined;
  }, [isAdmin, load]));

  async function refresh() {
    setRefreshing(true);
    try { await load(); } catch { setHasData(false); setError(friendlyReadError('No se pudo actualizar el resumen de clases.')); } finally { setRefreshing(false); }
  }

  if (!isAdmin) return <Redirect href="/home" />;

  return (
    <KeyboardAwareScreen refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={ucapsaBrand.colors.red} />}>
      <View style={styles.hero}>
        <Text style={styles.kicker}>Admin</Text>
        <Text style={styles.title}>Clases</Text>
        <Text style={styles.subtitle}>Programas, asistencias, niveles, horarios y competencia en una sola sección.</Text>
      </View>

      {loading ? <View style={styles.loading}><Text style={styles.muted}>Actualizando clases...</Text></View> : null}
      {error ? <View style={styles.errorBox}><Text style={styles.errorTitle}>No se pudo actualizar</Text><Text style={styles.muted}>{error}</Text><Pressable style={styles.retryButton} onPress={() => void refresh()}><Text style={styles.retryText}>Reintentar</Text></Pressable></View> : null}
      {hasData && !error ? (
        <View style={styles.metrics} accessibilityLabel={`Resumen: ${stats.puppy} inscripciones activas de Puppy y ${stats.comandos} de Comandos`}>
          <Metric label="Puppy activos" value={stats.puppy} icon="pets" />
          <Metric label="Comandos activos" value={stats.comandos} icon="school" />
        </View>
      ) : null}

      <Text style={styles.sectionTitle}>Entrenamiento</Text>
      <View style={styles.card}>
        <MenuRow icon="task-alt" title="Listos para evaluar" subtitle={hasData && !error ? `${stats.ready} pendientes · Decide si repiten, continúan o suben` : 'Revisar tarjetas completas y decidir progresión'} onPress={() => router.push('/admin/training-decisions' as never)} />
        <MenuRow icon="fact-check" title="Asistencia manual" subtitle="Elige cliente y registra o corrige asistencias" onPress={() => router.push('/admin-clients?intent=attendance' as never)} />
        <MenuRow icon="school" title="Inscripciones" subtitle="Buscar, crear o editar una inscripcion" onPress={() => router.push('/admin/classes' as never)} />
        <MenuRow icon="qr-code" title="QR de asistencia" subtitle="Ver, imprimir o reimprimir Puppy, Comandos y Socios" onPress={() => router.push('/admin/attendance-qr' as never)} />
        <MenuRow icon="qr-code-scanner" title="Escanear" subtitle="Abrir el escaner administrativo" onPress={() => router.push('/admin/scanner' as never)} />
        <MenuRow icon="schedule" title="Horarios" subtitle="Cambiar horarios desde una fecha sin tocar historial" onPress={() => router.push('/admin/class-schedules?status=active' as never)} />
        <MenuRow icon="event-busy" title="Cancelaciones" subtitle="Cancelar o reactivar una clase por fecha" onPress={() => router.push('/admin/class-cancellations' as never)} last />
      </View>

      <Text style={[styles.sectionTitle, styles.sectionTitleSpaced]}>Exámenes y competencia</Text>
      <View style={styles.card}>
        <MenuRow icon="fact-check" title="Calificar examen" subtitle="Un solo formulario: puntos y publicación oficial" onPress={() => router.push('/admin/competition-quick-grade' as never)} />
        <MenuRow icon="assignment" title="Exámenes" subtitle="Crear evaluación rápida o revisar exámenes detallados" onPress={() => router.push('/admin/competition-exams' as never)} last />
      </View>
      <View style={styles.card}>
        <MenuRow
          icon="emoji-events"
          title="Competencia UCAPSA"
          subtitle="Ranking, temporadas, constancia, exámenes, ajustes y premios"
          onPress={() => router.push('/admin/competition' as never)}
          last
        />
      </View>
    </KeyboardAwareScreen>
  );
}

function Metric({ label, value, icon }: { label: string; value: number; icon: keyof typeof MaterialIcons.glyphMap }) {
  return (
    <View style={styles.metric}>
      <MaterialIcons name={icon} size={20} color={ucapsaBrand.colors.redDark} />
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

function MenuRow({ icon, title, subtitle, onPress, last = false }: { icon: keyof typeof MaterialIcons.glyphMap; title: string; subtitle: string; onPress: () => void; last?: boolean }) {
  return (
    <Pressable style={[styles.row, last && styles.rowLast]} onPress={onPress}>
      <View style={styles.iconBox}><MaterialIcons name={icon} size={22} color={ucapsaBrand.colors.redDark} /></View>
      <View style={{ flex: 1 }}><Text style={styles.rowTitle}>{title}</Text><Text style={styles.rowSubtitle}>{subtitle}</Text></View>
      <MaterialIcons name="chevron-right" size={24} color={ucapsaBrand.colors.redDark} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hero: { marginBottom: 18 },
  kicker: { color: ucapsaBrand.colors.redDark, fontSize: 12, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.8 },
  title: { color: ucapsaBrand.colors.text, fontSize: 30, fontWeight: '900' },
  subtitle: { color: ucapsaBrand.colors.muted, fontSize: 13, lineHeight: 19, fontWeight: '700', marginTop: 3 },
  loading: { paddingVertical: 10 },
  muted: { color: ucapsaBrand.colors.muted, fontSize: 13, fontWeight: '700' },
  errorBox: { borderRadius: 18, borderWidth: 1, borderColor: ucapsaBrand.colors.dangerBorder, backgroundColor: ucapsaBrand.colors.dangerSoft, padding: 14, gap: 6, marginBottom: 14 },
  errorTitle: { color: ucapsaBrand.colors.danger, fontSize: 15, fontWeight: '900' },
  retryButton: { alignSelf: 'flex-start', borderRadius: 12, backgroundColor: ucapsaBrand.colors.red, paddingHorizontal: 13, paddingVertical: 9 },
  retryText: { color: ucapsaBrand.colors.surface, fontSize: 12, fontWeight: '900' },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 22 },
  metric: { width: '48%', borderRadius: 18, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, padding: 13, minHeight: 104, gap: 4 },
  metricValue: { color: ucapsaBrand.colors.text, fontSize: 23, fontWeight: '900' },
  metricLabel: { flex: 1, color: ucapsaBrand.colors.muted, fontSize: 12, fontWeight: '800' },
  sectionTitle: { color: ucapsaBrand.colors.text, fontSize: 19, fontWeight: '900', marginBottom: 10 },
  sectionTitleSpaced: { marginTop: 20 },
  card: { borderRadius: 22, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 15, borderBottomWidth: 1, borderBottomColor: ucapsaBrand.colors.premiumMuted },
  rowLast: { borderBottomWidth: 0 },
  iconBox: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: ucapsaBrand.colors.redSoft },
  rowTitle: { color: ucapsaBrand.colors.text, fontSize: 15, fontWeight: '900' },
  rowSubtitle: { color: ucapsaBrand.colors.muted, fontSize: 12, lineHeight: 17, fontWeight: '700', marginTop: 2 },
});
