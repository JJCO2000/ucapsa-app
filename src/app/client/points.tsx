import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Redirect, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { UcapsaPointsLeaderboard } from '../../components/domain/UcapsaPointsLeaderboard';
import { ClientPageHeader } from '../../components/layout/ClientPageHeader';
import { UcapsaAmbientBackground } from '../../components/layout/UcapsaAmbientBackground';
import { KeyboardAwareScreen } from '../../components/ui/KeyboardAwareScreen';
import { OfflineDataNotice } from '../../components/ui/OfflineDataNotice';
import { ucapsaBrand, withAlpha } from '../../constants/brand';
import { resolveUcapsaFormat } from '../../constants/ucapsaFormats';
import { useSession } from '../../hooks/useSession';
import { getUcapsaPointsScreenData, readCachedUcapsaPointsScreenData } from '../../services/ucapsa-points.service';
import type { UcapsaPointsLedgerEntry, UcapsaPointsScreenData } from '../../types/ucapsa-points.types';
import { DEFAULT_READ_TIMEOUT_MS, withOperationTimeout } from '../../utils/async.utils';

type InfoMode = 'rules' | 'history' | null;

function medalForTier(code: string | null | undefined) {
  if (code === 'gold') return '🥇';
  if (code === 'silver') return '🥈';
  if (code === 'bronze') return '🥉';
  return '🏅';
}

function formatLedgerDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('es-MX', { day: '2-digit', month: 'short' });
}

export default function UcapsaPointsScreen() {
  const { user, role, isAdmin } = useSession();
  const [data, setData] = useState<UcapsaPointsScreenData | null>(null);
  const [loading, setLoading] = useState(Boolean(user));
  const [refreshing, setRefreshing] = useState(false);
  const [usingSavedData, setUsingSavedData] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [infoMode, setInfoMode] = useState<InfoMode>(null);

  const format = useMemo(
    () => resolveUcapsaFormat({ user, role, isAdmin, membershipStatus: 'active' }),
    [isAdmin, role, user],
  );

  const load = useCallback(async () => {
    if (!user || isAdmin) return;
    setError(null);
    setUsingSavedData(false);

    const cached = await readCachedUcapsaPointsScreenData(user.id);
    if (cached) {
      setData(cached);
      setLoading(false);
    }

    try {
      const live = await withOperationTimeout(
        getUcapsaPointsScreenData(user.id),
        DEFAULT_READ_TIMEOUT_MS,
        'ucapsa-points-screen',
      );
      setData(live);
    } catch (loadError: any) {
      if (cached) {
        setUsingSavedData(true);
      } else {
        const message = String(loadError?.message ?? '');
        setError(message.includes('active_membership_required')
          ? 'Perro del Año está disponible para socios UCAPSA con membresía activa.'
          : 'No pudimos cargar la clasificación. Intenta de nuevo.');
      }
    } finally {
      setLoading(false);
    }
  }, [isAdmin, user]);

  useFocusEffect(useCallback(() => { void load(); return undefined; }, [load]));

  async function refresh() {
    setRefreshing(true);
    try { await load(); } finally { setRefreshing(false); }
  }

  if (isAdmin) return <Redirect href="/admin-more" />;
  if (!user) return <Redirect href="/home" />;

  const tier = data?.summary.current_tier ?? null;
  const nextTier = data?.summary.next_tier ?? null;

  return (
    <KeyboardAwareScreen
      backgroundColor={ucapsaBrand.colors.premiumBackground}
      style={{ backgroundColor: ucapsaBrand.colors.premiumBackground }}
      contentContainerStyle={styles.screenContent}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={ucapsaBrand.colors.premiumAction} />}
    >
      <UcapsaAmbientBackground format={format} variant="services" />
      <ClientPageHeader
        format={format}
        eyebrow="Club UCAPSA"
        title="Perro del Año"
        subtitle="Tu posición, tus puntos y el podio de la temporada."
        icon="emoji-events"
      />

      {usingSavedData && data?.cached_at ? (
        <OfflineDataNotice savedAt={data.cached_at} onRetry={() => void refresh()} premium />
      ) : null}

      {loading && !data ? (
        <View style={styles.loadingCard}>
          <ActivityIndicator color={ucapsaBrand.colors.premiumAction} />
          <Text style={styles.muted}>Cargando Puntos UCAPSA…</Text>
        </View>
      ) : null}

      {error && !data ? (
        <View style={styles.errorCard}>
          <MaterialIcons name="emoji-events" size={28} color={ucapsaBrand.colors.premiumAction} />
          <Text style={styles.errorTitle}>No pudimos abrir Perro del Año</Text>
          <Text style={styles.muted}>{error}</Text>
          <Pressable style={styles.retryButton} onPress={() => void refresh()}>
            <Text style={styles.retryText}>Reintentar</Text>
          </Pressable>
        </View>
      ) : null}

      {data ? (
        <>
          <View style={styles.medalCard}>
            <View style={styles.medalIconWrap}>
              <Text style={styles.medalEmoji}>{medalForTier(tier?.code)}</Text>
            </View>
            <View style={styles.medalCopy}>
              <Text style={styles.medalEyebrow}>TU MEDALLA DE TEMPORADA</Text>
              <Text style={styles.medalTitle}>{tier?.label ?? 'Aún sin medalla'}</Text>
              <Text style={styles.medalText}>
                {tier
                  ? nextTier && data.summary.points_to_next_tier != null
                    ? `${data.summary.points_to_next_tier} puntos para ${nextTier.label}.`
                    : 'Llegaste al rango más alto de esta temporada.'
                  : 'Consigue 10 puntos para desbloquear Bronce.'}
              </Text>
            </View>
          </View>

          <UcapsaPointsLeaderboard
            summary={data.summary}
            rows={data.leaderboard}
            onOpenRules={() => setInfoMode('rules')}
            onOpenHistory={() => setInfoMode('history')}
          />

          <View style={styles.tiersCard}>
            <Text style={styles.sectionEyebrow}>MEDALLAS</Text>
            <View style={styles.tierRow}>
              <TierPill emoji="🥉" label="Bronce" points="10 pts" />
              <TierPill emoji="🥈" label="Plata" points="25 pts" />
              <TierPill emoji="🥇" label="Oro" points="50 pts" />
            </View>
          </View>
        </>
      ) : null}

      <PointsInfoModal
        mode={infoMode}
        ledger={data?.recent_ledger ?? []}
        onClose={() => setInfoMode(null)}
      />
    </KeyboardAwareScreen>
  );
}

function TierPill({ emoji, label, points }: { emoji: string; label: string; points: string }) {
  return (
    <View style={styles.tierPill}>
      <Text style={styles.tierEmoji}>{emoji}</Text>
      <Text style={styles.tierLabel}>{label}</Text>
      <Text style={styles.tierPoints}>{points}</Text>
    </View>
  );
}

function PointsInfoModal({ mode, ledger, onClose }: { mode: InfoMode; ledger: UcapsaPointsLedgerEntry[]; onClose: () => void }) {
  const visible = mode != null;
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard} accessibilityViewIsModal>
          <View style={styles.modalHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.modalEyebrow}>PUNTOS UCAPSA</Text>
              <Text style={styles.modalTitle}>{mode === 'history' ? 'Tus movimientos' : 'Cómo ganas puntos'}</Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Cerrar" style={styles.closeButton} onPress={onClose}>
              <MaterialIcons name="close" size={24} color={ucapsaBrand.colors.premiumText} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.modalContent} showsVerticalScrollIndicator={false}>
            {mode === 'rules' ? (
              <>
                <RuleRow icon="school" title="Asistencia confirmada" detail="Cada asistencia válida a clase suma +1 punto." />
                <RuleRow icon="add-circle-outline" title="Bonos especiales" detail="UCAPSA puede añadir puntos manualmente por eventos especiales, promociones o reconocimientos." />
                <RuleRow icon="military-tech" title="Medallas" detail="Bronce desde 10 puntos, Plata desde 25 y Oro desde 50." />
                <Text style={styles.modalFootnote}>En este MVP las visitas de socio y evaluaciones todavía no suman automáticamente.</Text>
              </>
            ) : ledger.length > 0 ? (
              ledger.map((item) => (
                <View key={item.id} style={styles.ledgerRow}>
                  <View style={[styles.pointsBubble, item.points < 0 && styles.pointsBubbleNegative]}>
                    <Text style={[styles.pointsBubbleText, item.points < 0 && styles.pointsBubbleTextNegative]}>{item.points > 0 ? `+${item.points}` : item.points}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.ledgerReason}>{item.reason}</Text>
                    <Text style={styles.ledgerMeta}>{formatLedgerDate(item.occurred_at)}</Text>
                  </View>
                </View>
              ))
            ) : (
              <View style={styles.emptyHistory}>
                <MaterialIcons name="history" size={28} color={ucapsaBrand.colors.premiumAction} />
                <Text style={styles.emptyHistoryTitle}>Todavía no tienes movimientos</Text>
                <Text style={styles.muted}>Tu primera asistencia confirmada aparecerá aquí.</Text>
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function RuleRow({ icon, title, detail }: { icon: keyof typeof MaterialIcons.glyphMap; title: string; detail: string }) {
  return (
    <View style={styles.ruleRow}>
      <View style={styles.ruleIcon}><MaterialIcons name={icon} size={21} color={ucapsaBrand.colors.premiumActionText} /></View>
      <View style={{ flex: 1 }}><Text style={styles.ruleTitle}>{title}</Text><Text style={styles.ruleDetail}>{detail}</Text></View>
    </View>
  );
}

const styles = StyleSheet.create({
  screenContent: { position: 'relative', backgroundColor: ucapsaBrand.colors.premiumBackground },
  loadingCard: { minHeight: 100, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, borderRadius: 22, borderWidth: 1, borderColor: ucapsaBrand.colors.premiumBorder, backgroundColor: ucapsaBrand.colors.premiumSurface, padding: 18 },
  errorCard: { alignItems: 'center', gap: 8, borderRadius: 22, borderWidth: 1, borderColor: ucapsaBrand.colors.premiumBorder, backgroundColor: ucapsaBrand.colors.premiumSurface, padding: 20 },
  errorTitle: { color: ucapsaBrand.colors.premiumText, fontSize: 17, lineHeight: 22, fontWeight: '900', textAlign: 'center' },
  muted: { color: ucapsaBrand.colors.premiumMuted, fontSize: 12, lineHeight: 18, fontWeight: '700', textAlign: 'center' },
  retryButton: { marginTop: 4, minHeight: 44, justifyContent: 'center', borderRadius: 14, backgroundColor: ucapsaBrand.colors.premiumActionText, paddingHorizontal: 18 },
  retryText: { color: ucapsaBrand.colors.premiumSurface, fontSize: 12, fontWeight: '900' },
  medalCard: { minHeight: 104, flexDirection: 'row', alignItems: 'center', gap: 13, borderRadius: 24, borderWidth: 1, borderColor: ucapsaBrand.colors.premiumBorderStrong, backgroundColor: ucapsaBrand.colors.premiumHero, padding: 15, marginBottom: 14 },
  medalIconWrap: { width: 62, height: 62, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: ucapsaBrand.colors.premiumSurface },
  medalEmoji: { fontSize: 34, lineHeight: 40 },
  medalCopy: { flex: 1, minWidth: 0 },
  medalEyebrow: { color: ucapsaBrand.colors.premiumAction, fontSize: 9, lineHeight: 12, fontWeight: '900', letterSpacing: 0.9 },
  medalTitle: { marginTop: 2, color: ucapsaBrand.colors.premiumText, fontSize: 20, lineHeight: 25, fontWeight: '900' },
  medalText: { marginTop: 2, color: ucapsaBrand.colors.premiumMuted, fontSize: 11, lineHeight: 16, fontWeight: '700' },
  tiersCard: { marginTop: 14, borderRadius: 22, borderWidth: 1, borderColor: ucapsaBrand.colors.premiumBorder, backgroundColor: ucapsaBrand.colors.premiumSurface, padding: 14 },
  sectionEyebrow: { color: ucapsaBrand.colors.premiumAction, fontSize: 10, lineHeight: 13, fontWeight: '900', letterSpacing: 0.9, marginBottom: 10 },
  tierRow: { flexDirection: 'row', gap: 8 },
  tierPill: { flex: 1, minHeight: 88, alignItems: 'center', justifyContent: 'center', borderRadius: 18, backgroundColor: ucapsaBrand.colors.premiumSurfaceAlt, padding: 8 },
  tierEmoji: { fontSize: 25, lineHeight: 31 },
  tierLabel: { marginTop: 2, color: ucapsaBrand.colors.premiumText, fontSize: 12, lineHeight: 16, fontWeight: '900' },
  tierPoints: { marginTop: 1, color: ucapsaBrand.colors.premiumMuted, fontSize: 9, lineHeight: 12, fontWeight: '800' },
  modalBackdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20, paddingVertical: 28, backgroundColor: withAlpha(ucapsaBrand.colors.black, 0.52) },
  modalCard: { width: '100%', maxWidth: 560, maxHeight: '78%', overflow: 'hidden', borderRadius: 28, borderWidth: 1, borderColor: ucapsaBrand.colors.premiumBorder, backgroundColor: ucapsaBrand.colors.premiumSurface },
  modalHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingTop: 16, paddingBottom: 10 },
  modalEyebrow: { color: ucapsaBrand.colors.premiumAction, fontSize: 9, lineHeight: 12, fontWeight: '900', letterSpacing: 0.9 },
  modalTitle: { marginTop: 2, color: ucapsaBrand.colors.premiumText, fontSize: 23, lineHeight: 28, fontWeight: '900' },
  closeButton: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: ucapsaBrand.colors.premiumSurfaceAlt },
  modalContent: { paddingHorizontal: 18, paddingBottom: 22, gap: 10 },
  ruleRow: { flexDirection: 'row', alignItems: 'center', gap: 11, borderRadius: 18, backgroundColor: ucapsaBrand.colors.premiumSurfaceAlt, padding: 13 },
  ruleIcon: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: ucapsaBrand.colors.premiumBurgundySoft },
  ruleTitle: { color: ucapsaBrand.colors.premiumText, fontSize: 14, lineHeight: 18, fontWeight: '900' },
  ruleDetail: { marginTop: 2, color: ucapsaBrand.colors.premiumMuted, fontSize: 11, lineHeight: 16, fontWeight: '700' },
  modalFootnote: { color: ucapsaBrand.colors.premiumMuted, fontSize: 11, lineHeight: 17, fontWeight: '700', paddingHorizontal: 3, paddingTop: 2 },
  ledgerRow: { minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: 11, borderBottomWidth: 1, borderBottomColor: withAlpha(ucapsaBrand.colors.premiumActionText, 0.08), paddingVertical: 8 },
  pointsBubble: { minWidth: 48, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: ucapsaBrand.colors.premiumBurgundySoft },
  pointsBubbleNegative: { backgroundColor: ucapsaBrand.colors.dangerSoft },
  pointsBubbleText: { color: ucapsaBrand.colors.premiumActionText, fontSize: 14, fontWeight: '900' },
  pointsBubbleTextNegative: { color: ucapsaBrand.colors.danger },
  ledgerReason: { color: ucapsaBrand.colors.premiumText, fontSize: 13, lineHeight: 17, fontWeight: '900' },
  ledgerMeta: { marginTop: 2, color: ucapsaBrand.colors.premiumMuted, fontSize: 10, lineHeight: 13, fontWeight: '700' },
  emptyHistory: { minHeight: 150, alignItems: 'center', justifyContent: 'center', gap: 6, padding: 18 },
  emptyHistoryTitle: { color: ucapsaBrand.colors.premiumText, fontSize: 16, lineHeight: 21, fontWeight: '900' },
});
