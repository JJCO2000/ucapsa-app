import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { KeyboardAwareScreen } from '../../components/ui/KeyboardAwareScreen';
import { ucapsaBrand } from '../../constants/brand';
import { useSession } from '../../hooks/useSession';
import {
  activateCompetitionSeason,
  closeCompetitionSeason,
  formatSeasonDate,
  getAdminCompetitionSeason,
  reopenCompetitionSeason,
  type CompetitionSeason,
} from '../../services/ucapsa-competition.service';

const statusLabel: Record<string, string> = {
  draft: 'Borrador',
  active: 'Activa',
  closed: 'Cerrada',
  reopened: 'Reabierta',
};

export default function AdminCompetitionSeasonDetailScreen() {
  const { seasonId } = useLocalSearchParams<{ seasonId?: string }>();
  const { role } = useSession();
  const [season, setSeason] = useState<CompetitionSeason | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isSuperAdmin = role === 'super_admin';
  const resolvedSeasonId = typeof seasonId === 'string' ? seasonId : '';

  const load = useCallback(async () => {
    if (!resolvedSeasonId) {
      setError('Falta la temporada.');
      setLoading(false);
      return;
    }
    setError(null);
    try {
      setSeason(await getAdminCompetitionSeason(resolvedSeasonId));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'No se pudo cargar la temporada.');
    } finally {
      setLoading(false);
    }
  }, [resolvedSeasonId]);

  useFocusEffect(useCallback(() => {
    setLoading(true);
    void load();
    return undefined;
  }, [load]));

  async function refresh() {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  }

  async function runAction(action: 'activate' | 'close' | 'reopen') {
    if (!season) return;
    setWorking(true);
    try {
      if (action === 'activate') await activateCompetitionSeason(season.id);
      if (action === 'close') await closeCompetitionSeason(season.id);
      if (action === 'reopen') await reopenCompetitionSeason(season.id);
      await load();
    } catch (actionError) {
      Alert.alert('No se pudo cambiar la temporada', actionError instanceof Error ? actionError.message : 'Intenta de nuevo.');
    } finally {
      setWorking(false);
    }
  }

  function confirmClose() {
    Alert.alert(
      'Cerrar temporada',
      'Al cerrarla se congelan asistencias, visitas, exámenes y ajustes competitivos hasta que un Superadmin la reabra.',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Cerrar temporada', style: 'destructive', onPress: () => void runAction('close') },
      ],
    );
  }

  function confirmActivate() {
    Alert.alert(
      'Activar temporada',
      'Será la temporada competitiva actual. Sólo puede existir una activa.',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Activar', onPress: () => void runAction('activate') },
      ],
    );
  }

  function confirmReopen() {
    Alert.alert(
      'Reabrir temporada',
      'La temporada seguirá siendo histórica, pero sus fuentes competitivas volverán a permitir correcciones.',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Reabrir', onPress: () => void runAction('reopen') },
      ],
    );
  }

  return (
    <KeyboardAwareScreen refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={ucapsaBrand.colors.red} />}>
      {loading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={ucapsaBrand.colors.red} />
          <Text style={styles.muted}>Cargando temporada…</Text>
        </View>
      ) : null}

      {error ? (
        <View style={styles.errorCard}>
          <Text style={styles.errorTitle}>No se pudo cargar</Text>
          <Text style={styles.muted}>{error}</Text>
        </View>
      ) : null}

      {!loading && !error && season ? (
        <>
          <View style={styles.header}>
            <Text style={styles.kicker}>Temporada UCAPSA</Text>
            <Text style={styles.title}>{season.name}</Text>
            <View style={styles.statusLine}>
              <StatusPill status={season.status} />
              <Text style={styles.code}>{season.code}</Text>
            </View>
          </View>

          <View style={styles.card}>
            <InfoRow label="Inicio" value={formatSeasonDate(season.starts_at)} />
            <InfoRow label="Fin" value={formatSeasonDate(new Date(new Date(season.ends_at).getTime() - 1).toISOString())} />
            <InfoRow label="Estado" value={statusLabel[season.status] ?? season.status} last />
          </View>

          {season.status === 'closed' ? (
            <View style={styles.freezeCard}>
              <MaterialIcons name="lock" size={20} color={ucapsaBrand.colors.redDark} />
              <Text style={styles.freezeText}>Temporada congelada. Sus hechos competitivos no se pueden modificar mientras permanezca cerrada.</Text>
            </View>
          ) : null}

          {season.status === 'reopened' ? (
            <View style={styles.warningCard}>
              <MaterialIcons name="edit-calendar" size={20} color={ucapsaBrand.colors.warningDark} />
              <Text style={styles.warningText}>Temporada histórica reabierta para correcciones. No sustituye a la temporada activa.</Text>
            </View>
          ) : null}

          <Text style={styles.sectionTitle}>Acciones</Text>
          <View style={styles.actionsCard}>
            {season.status === 'draft' && isSuperAdmin ? (
              <>
                <ActionRow
                  icon="edit"
                  title="Editar configuración"
                  subtitle="Código, nombre y fechas"
                  onPress={() => router.push(`/admin/competition-season-form?seasonId=${season.id}` as never)}
                />
                <ActionRow icon="play-circle" title="Activar temporada" subtitle="Convertirla en la temporada competitiva actual" onPress={confirmActivate} last />
              </>
            ) : null}

            {season.status === 'active' ? (
              <ActionRow icon="lock" title="Cerrar temporada" subtitle="Congelar los hechos competitivos del periodo" onPress={confirmClose} last />
            ) : null}

            {season.status === 'closed' && isSuperAdmin ? (
              <ActionRow icon="lock-open" title="Reabrir para correcciones" subtitle="Permitir ajustes históricos sin convertirla en activa" onPress={confirmReopen} last />
            ) : null}

            {season.status === 'reopened' ? (
              <ActionRow icon="lock" title="Cerrar de nuevo" subtitle="Aplicar el congelamiento después de corregir" onPress={confirmClose} last />
            ) : null}

            {((season.status === 'closed' && !isSuperAdmin) || (season.status === 'draft' && !isSuperAdmin)) ? (
              <View style={styles.readOnlyRow}>
                <MaterialIcons name="visibility" size={20} color={ucapsaBrand.colors.muted} />
                <Text style={styles.muted}>Tu rol puede consultar esta temporada, pero esta acción requiere Superadmin.</Text>
              </View>
            ) : null}
          </View>

          {working ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator color={ucapsaBrand.colors.red} />
              <Text style={styles.muted}>Aplicando cambio…</Text>
            </View>
          ) : null}
        </>
      ) : null}
    </KeyboardAwareScreen>
  );
}

function InfoRow({ label, value, last = false }: { label: string; value: string; last?: boolean }) {
  return (
    <View style={[styles.infoRow, last && styles.infoRowLast]}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

function StatusPill({ status }: { status: string }) {
  const active = status === 'active';
  const reopened = status === 'reopened';
  return (
    <View style={[styles.statusPill, active && styles.statusActive, reopened && styles.statusReopened]}>
      <Text style={[styles.statusText, active && styles.statusActiveText, reopened && styles.statusReopenedText]}>{statusLabel[status] ?? status}</Text>
    </View>
  );
}

function ActionRow({
  icon,
  title,
  subtitle,
  onPress,
  last = false,
}: {
  icon: keyof typeof MaterialIcons.glyphMap;
  title: string;
  subtitle: string;
  onPress: () => void;
  last?: boolean;
}) {
  return (
    <Pressable style={[styles.actionRow, last && styles.actionRowLast]} onPress={onPress}>
      <View style={styles.actionIcon}><MaterialIcons name={icon} size={21} color={ucapsaBrand.colors.redDark} /></View>
      <View style={{ flex: 1 }}>
        <Text style={styles.actionTitle}>{title}</Text>
        <Text style={styles.muted}>{subtitle}</Text>
      </View>
      <MaterialIcons name="chevron-right" size={23} color={ucapsaBrand.colors.redDark} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 13 },
  muted: { color: ucapsaBrand.colors.muted, fontSize: 12, lineHeight: 17, fontWeight: '700' },
  errorCard: { borderRadius: 17, borderWidth: 1, borderColor: ucapsaBrand.colors.dangerBorder, backgroundColor: ucapsaBrand.colors.dangerSoft, padding: 13 },
  errorTitle: { color: ucapsaBrand.colors.danger, fontSize: 14, fontWeight: '900' },
  header: { gap: 3, marginBottom: 15 },
  kicker: { color: ucapsaBrand.colors.redDark, fontSize: 11, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.7 },
  title: { color: ucapsaBrand.colors.text, fontSize: 28, lineHeight: 34, fontWeight: '900' },
  statusLine: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  code: { color: ucapsaBrand.colors.muted, fontSize: 11, fontWeight: '800' },
  statusPill: { borderRadius: 999, backgroundColor: ucapsaBrand.colors.graySoft, paddingHorizontal: 8, paddingVertical: 4 },
  statusText: { color: ucapsaBrand.colors.grayDark, fontSize: 10, fontWeight: '900' },
  statusActive: { backgroundColor: ucapsaBrand.colors.successSoft, borderWidth: 1, borderColor: ucapsaBrand.colors.successBorder },
  statusActiveText: { color: ucapsaBrand.colors.successDark },
  statusReopened: { backgroundColor: ucapsaBrand.colors.warningSoft, borderWidth: 1, borderColor: ucapsaBrand.colors.warningBorder },
  statusReopenedText: { color: ucapsaBrand.colors.warningDark },
  card: { borderRadius: 20, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, overflow: 'hidden', marginBottom: 12 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, padding: 14, borderBottomWidth: 1, borderBottomColor: ucapsaBrand.colors.premiumMuted },
  infoRowLast: { borderBottomWidth: 0 },
  infoLabel: { color: ucapsaBrand.colors.muted, fontSize: 12, fontWeight: '800' },
  infoValue: { color: ucapsaBrand.colors.text, fontSize: 12, fontWeight: '900', textAlign: 'right' },
  freezeCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, borderRadius: 16, backgroundColor: ucapsaBrand.colors.redSoftMuted, padding: 12, marginBottom: 12 },
  freezeText: { flex: 1, color: ucapsaBrand.colors.redDark, fontSize: 11, lineHeight: 16, fontWeight: '800' },
  warningCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, borderRadius: 16, backgroundColor: ucapsaBrand.colors.warningSoft, borderWidth: 1, borderColor: ucapsaBrand.colors.warningBorder, padding: 12, marginBottom: 12 },
  warningText: { flex: 1, color: ucapsaBrand.colors.warningDark, fontSize: 11, lineHeight: 16, fontWeight: '800' },
  sectionTitle: { color: ucapsaBrand.colors.text, fontSize: 18, fontWeight: '900', marginTop: 6, marginBottom: 9 },
  actionsCard: { borderRadius: 20, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, overflow: 'hidden' },
  actionRow: { minHeight: 70, flexDirection: 'row', alignItems: 'center', gap: 11, padding: 14, borderBottomWidth: 1, borderBottomColor: ucapsaBrand.colors.premiumMuted },
  actionRowLast: { borderBottomWidth: 0 },
  actionIcon: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: ucapsaBrand.colors.redSoft },
  actionTitle: { color: ucapsaBrand.colors.text, fontSize: 14, fontWeight: '900', marginBottom: 2 },
  readOnlyRow: { flexDirection: 'row', gap: 9, alignItems: 'center', padding: 14 },
});
