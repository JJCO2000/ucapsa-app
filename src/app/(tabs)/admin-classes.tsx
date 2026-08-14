import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Redirect, router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { KeyboardAwareScreen } from '../../components/ui/KeyboardAwareScreen';
import { ucapsaBrand } from '../../constants/brand';
import { useSession } from '../../hooks/useSession';
import { getAdminProgramRows, getProgramClassCancellations, getProgramSchedules } from '../../services/programs.service';

type ClassStats = { puppy: number; comandos: number; schedules: number; cancellations: number };
const emptyStats: ClassStats = { puppy: 0, comandos: 0, schedules: 0, cancellations: 0 };

export default function AdminClassesTab() {
  const { isAdmin } = useSession();
  const [stats, setStats] = useState<ClassStats>(emptyStats);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!isAdmin) return;
    const [rows, schedules, cancellations] = await Promise.all([
      getAdminProgramRows(),
      getProgramSchedules(),
      getProgramClassCancellations(false),
    ]);
    setStats({
      puppy: rows.filter((row) => row.enrollment.status === 'active' && row.program.code === 'puppy').length,
      comandos: rows.filter((row) => row.enrollment.status === 'active' && row.program.code === 'comandos').length,
      schedules: schedules.filter((row) => row.is_active).length,
      cancellations: cancellations.length,
    });
  }, [isAdmin]);

  useFocusEffect(useCallback(() => { void load(); return undefined; }, [load]));

  async function refresh() {
    setRefreshing(true);
    try { await load(); } finally { setRefreshing(false); }
  }

  if (!isAdmin) return <Redirect href="/home" />;

  return (
    <KeyboardAwareScreen refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={ucapsaBrand.colors.red} />}>
      <View style={styles.hero}>
        <Text style={styles.kicker}>Admin</Text>
        <Text style={styles.title}>Clases</Text>
        <Text style={styles.subtitle}>Elige una tarea y entra directo a lo que necesitas.</Text>
      </View>

      <View style={styles.metrics}>
        <Metric label="Puppy activos" value={stats.puppy} icon="pets" onPress={() => router.push('/admin/classes?program=puppy&status=active' as never)} />
        <Metric label="Comandos activos" value={stats.comandos} icon="school" onPress={() => router.push('/admin/classes?program=comandos&status=active' as never)} />
        <Metric label="Horarios activos" value={stats.schedules} icon="schedule" onPress={() => router.push('/admin/class-schedules?status=active' as never)} />
        <Metric label="Cancelaciones" value={stats.cancellations} icon="event-busy" onPress={() => router.push('/admin/class-cancellations' as never)} />
      </View>

      <Text style={styles.sectionTitle}>Gestion</Text>
      <View style={styles.card}>
        <MenuRow icon="fact-check" title="Asistencia manual" subtitle="Elige cliente y registra o corrige asistencias" onPress={() => router.push('/admin-clients?intent=attendance' as never)} />
        <MenuRow icon="school" title="Inscripciones" subtitle="Buscar, crear o editar una inscripcion" onPress={() => router.push('/admin/classes' as never)} />
        <MenuRow icon="qr-code" title="QR de asistencia" subtitle="Ver, imprimir o reimprimir Puppy y Comandos" onPress={() => router.push('/admin/attendance-qr' as never)} />
        <MenuRow icon="qr-code-scanner" title="Escanear" subtitle="Abrir el escaner administrativo" onPress={() => router.push('/admin/scanner' as never)} />
        <MenuRow icon="schedule" title="Horarios" subtitle="Cambiar horarios desde una fecha sin tocar historial" onPress={() => router.push('/admin/class-schedules?status=active' as never)} />
        <MenuRow icon="event-busy" title="Cancelaciones" subtitle="Cancelar o reactivar una clase por fecha" onPress={() => router.push('/admin/class-cancellations' as never)} last />
      </View>
    </KeyboardAwareScreen>
  );
}

function Metric({ label, value, icon, onPress }: { label: string; value: number; icon: keyof typeof MaterialIcons.glyphMap; onPress: () => void }) {
  return (
    <Pressable style={({ pressed }) => [styles.metric, pressed && styles.pressed]} onPress={onPress}>
      <MaterialIcons name={icon} size={20} color={ucapsaBrand.colors.redDark} />
      <Text style={styles.metricValue}>{value}</Text>
      <View style={styles.metricFooter}>
        <Text style={styles.metricLabel}>{label}</Text>
        <MaterialIcons name="chevron-right" size={18} color={ucapsaBrand.colors.redDark} />
      </View>
    </Pressable>
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
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 22 },
  metric: { width: '48%', borderRadius: 18, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: '#fff', padding: 13, minHeight: 104, gap: 4 },
  metricValue: { color: ucapsaBrand.colors.text, fontSize: 23, fontWeight: '900' },
  metricFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 },
  metricLabel: { flex: 1, color: ucapsaBrand.colors.muted, fontSize: 12, fontWeight: '800' },
  pressed: { opacity: 0.78, transform: [{ scale: 0.99 }] },
  sectionTitle: { color: ucapsaBrand.colors.text, fontSize: 19, fontWeight: '900', marginBottom: 10 },
  card: { borderRadius: 22, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: '#fff', overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 15, borderBottomWidth: 1, borderBottomColor: '#F4E5E8' },
  rowLast: { borderBottomWidth: 0 },
  iconBox: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: ucapsaBrand.colors.redSoft },
  rowTitle: { color: ucapsaBrand.colors.text, fontSize: 15, fontWeight: '900' },
  rowSubtitle: { color: ucapsaBrand.colors.muted, fontSize: 12, lineHeight: 17, fontWeight: '700', marginTop: 2 },
});
