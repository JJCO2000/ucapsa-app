import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ucapsaBrand, withAlpha } from '../../constants/brand';
import type { UcapsaPointsLeaderboardRow, UcapsaPointsSummary } from '../../types/ucapsa-points.types';

type Props = {
  summary: UcapsaPointsSummary;
  rows: UcapsaPointsLeaderboardRow[];
  onOpenRules?: () => void;
  onOpenHistory?: () => void;
};

function rankLabel(row: UcapsaPointsLeaderboardRow) {
  return row.tied ? `Empate #${row.rank}` : `#${row.rank}`;
}

function podiumMedal(rank: number) {
  if (rank === 1) return '🥇';
  if (rank === 2) return '🥈';
  if (rank === 3) return '🥉';
  return '🏅';
}

function PodiumItem({ row, emphasized = false }: { row: UcapsaPointsLeaderboardRow | null; emphasized?: boolean }) {
  if (!row) return <View style={styles.podiumSlot} />;

  return (
    <View style={[styles.podiumSlot, emphasized && styles.podiumSlotFirst]} accessibilityLabel={`${rankLabel(row)}. ${row.display_name}. ${row.total_points} puntos.`}>
      <Text style={styles.podiumMedal}>{podiumMedal(row.rank)}</Text>
      <Text numberOfLines={1} style={[styles.podiumName, emphasized && styles.podiumNameFirst]}>{row.display_name}</Text>
      <Text style={[styles.podiumPoints, emphasized && styles.podiumPointsFirst]}>{row.total_points} pts</Text>
      <View style={[styles.podiumBlock, emphasized && styles.podiumBlockFirst]}>
        <Text style={styles.podiumRank}>{row.rank}</Text>
        {row.tied ? <Text style={styles.tieText}>EMPATE</Text> : null}
      </View>
    </View>
  );
}

export function UcapsaPointsLeaderboard({ summary, rows, onOpenRules, onOpenHistory }: Props) {
  const ordered = [...rows].sort((left, right) => left.rank - right.rank || right.total_points - left.total_points || left.display_name.localeCompare(right.display_name, 'es-MX'));
  const podium = ordered.slice(0, 3);
  const second = podium[1] ?? null;
  const first = podium[0] ?? null;
  const third = podium[2] ?? null;
  const current = ordered.find((item) => item.is_current_user) ?? null;
  const remaining = ordered.filter((item) => !podium.includes(item)).slice(0, 12);
  const participantName = summary.participant?.display_name ?? current?.display_name ?? 'Tu perro';
  const currentRank = summary.rank ?? current?.rank ?? null;
  const currentPoints = summary.total_points;
  const tierLabel = summary.current_tier?.label ?? 'Sin rango';

  return (
    <View style={styles.wrapper}>
      <View style={styles.hero}>
        <View style={styles.heroIcon}>
          <MaterialIcons name="emoji-events" size={25} color={ucapsaBrand.colors.premiumActionText} />
        </View>
        <View style={styles.heroCopy}>
          <Text style={styles.heroEyebrow}>PUNTOS UCAPSA · DOG CLUB</Text>
          <Text style={styles.heroTitle}>{summary.season.name}</Text>
          <Text style={styles.heroText}>Cada asistencia confirmada suma 1 punto. Los bonos especiales los registra UCAPSA.</Text>
        </View>
      </View>

      {podium.length > 0 ? (
        <View style={styles.podiumCard}>
          <Text style={styles.sectionEyebrow}>PODIO ACTUAL</Text>
          <View style={styles.podiumRow}>
            <PodiumItem row={second} />
            <PodiumItem row={first} emphasized />
            <PodiumItem row={third} />
          </View>
        </View>
      ) : (
        <View style={styles.emptyCard}>
          <MaterialIcons name="leaderboard" size={25} color={ucapsaBrand.colors.premiumAction} />
          <Text style={styles.emptyTitle}>Todavía no hay puntos en el ranking</Text>
          <Text style={styles.emptyText}>El podio aparecerá en cuanto el primer socio reciba puntos.</Text>
        </View>
      )}

      <View style={styles.meCard} accessibilityLabel={`Tu posición. ${participantName}. ${currentRank ? `Lugar ${currentRank}.` : 'Sin posición todavía.'} ${currentPoints} puntos. ${tierLabel}.`}>
        <View style={styles.meTopRow}>
          <View>
            <Text style={styles.sectionEyebrow}>TU POSICIÓN</Text>
            <Text style={styles.meName}>{participantName}</Text>
          </View>
          <View style={styles.rankPill}>
            <Text style={styles.rankPillText}>{currentRank ? `#${currentRank}` : '—'}</Text>
          </View>
        </View>
        <View style={styles.meStats}>
          <View style={styles.meStat}>
            <Text style={styles.meStatValue}>{currentPoints}</Text>
            <Text style={styles.meStatLabel}>PUNTOS</Text>
          </View>
          <View style={styles.meDivider} />
          <View style={styles.meStat}>
            <Text numberOfLines={1} style={styles.meStatValueSmall}>{tierLabel}</Text>
            <Text style={styles.meStatLabel}>RANGO</Text>
          </View>
        </View>
        {summary.next_tier && summary.points_to_next_tier != null ? (
          <View style={styles.nextTierRow}>
            <MaterialIcons name="military-tech" size={18} color={ucapsaBrand.colors.premiumAction} />
            <Text style={styles.nextTierText}>{summary.points_to_next_tier} pts para {summary.next_tier.label}</Text>
          </View>
        ) : null}
      </View>

      {remaining.length > 0 ? (
        <View style={styles.rankingCard}>
          <Text style={styles.sectionEyebrow}>CLASIFICACIÓN</Text>
          {remaining.map((row, index) => (
            <View key={row.participant_id ?? `${row.rank}:${row.dog_id}`} style={[styles.rankingRow, index === remaining.length - 1 && styles.rankingRowLast, row.is_current_user && styles.rankingRowCurrent]}>
              <Text style={styles.rankingRank}>{row.tied ? `=${row.rank}` : row.rank}</Text>
              <View style={styles.rankingDogIcon}>
                <MaterialIcons name="pets" size={17} color={ucapsaBrand.colors.premiumActionText} />
              </View>
              <View style={styles.rankingCopy}>
                <Text numberOfLines={1} style={styles.rankingName}>{row.display_name}</Text>
                {row.tier_label ? <Text style={styles.rankingTier}>{row.tier_label}</Text> : null}
              </View>
              <Text style={styles.rankingPoints}>{row.total_points} pts</Text>
            </View>
          ))}
        </View>
      ) : null}

      <View style={styles.actionsCard}>
        {onOpenRules ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Cómo ganar puntos" style={styles.actionRow} onPress={onOpenRules}>
            <View style={styles.actionIcon}><MaterialIcons name="help-outline" size={20} color={ucapsaBrand.colors.premiumActionText} /></View>
            <Text style={styles.actionText}>¿Cómo gano puntos?</Text>
            <MaterialIcons name="chevron-right" size={22} color={ucapsaBrand.colors.premiumAction} />
          </Pressable>
        ) : null}
        {onOpenHistory ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Mis movimientos de puntos" style={[styles.actionRow, onOpenRules && styles.actionRowBorder]} onPress={onOpenHistory}>
            <View style={styles.actionIcon}><MaterialIcons name="history" size={20} color={ucapsaBrand.colors.premiumActionText} /></View>
            <Text style={styles.actionText}>Mis movimientos de puntos</Text>
            <MaterialIcons name="chevron-right" size={22} color={ucapsaBrand.colors.premiumAction} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: 14 },
  hero: { minHeight: 112, flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 24, borderWidth: 1, borderColor: ucapsaBrand.colors.premiumBorderStrong, backgroundColor: ucapsaBrand.colors.premiumSurface, padding: 16 },
  heroIcon: { width: 52, height: 52, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: ucapsaBrand.colors.premiumSurfaceAlt, borderWidth: 1, borderColor: ucapsaBrand.colors.premiumBorder },
  heroCopy: { flex: 1, minWidth: 0 },
  heroEyebrow: { color: ucapsaBrand.colors.premiumAction, fontSize: 10, lineHeight: 13, fontWeight: '900', letterSpacing: 0.9 },
  heroTitle: { marginTop: 2, color: ucapsaBrand.colors.premiumText, fontSize: 23, lineHeight: 28, fontWeight: '900', letterSpacing: -0.3 },
  heroText: { marginTop: 3, color: ucapsaBrand.colors.premiumMuted, fontSize: 12, lineHeight: 17, fontWeight: '700' },
  sectionEyebrow: { color: ucapsaBrand.colors.premiumAction, fontSize: 10, lineHeight: 13, fontWeight: '900', letterSpacing: 0.95 },
  podiumCard: { borderRadius: 24, borderWidth: 1, borderColor: ucapsaBrand.colors.premiumBorder, backgroundColor: ucapsaBrand.colors.premiumHero, padding: 14 },
  podiumRow: { minHeight: 190, marginTop: 8, flexDirection: 'row', alignItems: 'flex-end', gap: 7 },
  podiumSlot: { flex: 1, minWidth: 0, alignItems: 'center', justifyContent: 'flex-end' },
  podiumSlotFirst: { paddingBottom: 8 },
  podiumMedal: { fontSize: 26, lineHeight: 32 },
  podiumName: { width: '100%', color: ucapsaBrand.colors.premiumText, textAlign: 'center', fontSize: 13, lineHeight: 17, fontWeight: '900' },
  podiumNameFirst: { fontSize: 15, lineHeight: 19 },
  podiumPoints: { marginTop: 1, color: ucapsaBrand.colors.premiumMuted, fontSize: 11, lineHeight: 15, fontWeight: '800' },
  podiumPointsFirst: { color: ucapsaBrand.colors.premiumActionText, fontSize: 12 },
  podiumBlock: { marginTop: 8, width: '100%', minHeight: 70, borderTopLeftRadius: 16, borderTopRightRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: ucapsaBrand.colors.premiumSurfaceAlt, borderWidth: 1, borderColor: ucapsaBrand.colors.premiumBorder },
  podiumBlockFirst: { minHeight: 104, backgroundColor: ucapsaBrand.colors.premiumActionSoft, borderColor: ucapsaBrand.colors.premiumBorderStrong },
  podiumRank: { color: ucapsaBrand.colors.premiumActionText, fontSize: 28, lineHeight: 32, fontWeight: '900' },
  tieText: { marginTop: 1, color: ucapsaBrand.colors.premiumMuted, fontSize: 8, lineHeight: 10, fontWeight: '900', letterSpacing: 0.7 },
  emptyCard: { minHeight: 120, alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 24, borderWidth: 1, borderColor: ucapsaBrand.colors.premiumBorder, backgroundColor: ucapsaBrand.colors.premiumHero, padding: 18 },
  emptyTitle: { color: ucapsaBrand.colors.premiumText, fontSize: 16, lineHeight: 21, fontWeight: '900', textAlign: 'center' },
  emptyText: { color: ucapsaBrand.colors.premiumMuted, fontSize: 12, lineHeight: 17, fontWeight: '700', textAlign: 'center' },
  meCard: { borderRadius: 22, borderWidth: 1, borderColor: ucapsaBrand.colors.premiumBorderStrong, backgroundColor: ucapsaBrand.colors.premiumSurface, padding: 15, shadowColor: ucapsaBrand.colors.redDeep, shadowOpacity: 0.05, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 1 },
  meTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  meName: { marginTop: 2, color: ucapsaBrand.colors.premiumText, fontSize: 21, lineHeight: 26, fontWeight: '900' },
  rankPill: { minWidth: 58, minHeight: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: ucapsaBrand.colors.premiumBurgundySoft },
  rankPillText: { color: ucapsaBrand.colors.premiumActionText, fontSize: 18, lineHeight: 22, fontWeight: '900' },
  meStats: { marginTop: 14, flexDirection: 'row', alignItems: 'stretch', borderRadius: 18, backgroundColor: ucapsaBrand.colors.premiumSurfaceAlt, padding: 12 },
  meStat: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  meDivider: { width: 1, backgroundColor: withAlpha(ucapsaBrand.colors.premiumActionText, 0.14) },
  meStatValue: { color: ucapsaBrand.colors.premiumActionText, fontSize: 25, lineHeight: 29, fontWeight: '900' },
  meStatValueSmall: { color: ucapsaBrand.colors.premiumActionText, fontSize: 17, lineHeight: 22, fontWeight: '900' },
  meStatLabel: { marginTop: 2, color: ucapsaBrand.colors.premiumMuted, fontSize: 9, lineHeight: 12, fontWeight: '900', letterSpacing: 0.8 },
  nextTierRow: { marginTop: 11, flexDirection: 'row', alignItems: 'center', gap: 7 },
  nextTierText: { flex: 1, color: ucapsaBrand.colors.premiumMuted, fontSize: 12, lineHeight: 17, fontWeight: '800' },
  rankingCard: { borderRadius: 22, borderWidth: 1, borderColor: ucapsaBrand.colors.premiumBorder, backgroundColor: ucapsaBrand.colors.premiumSurface, padding: 14 },
  rankingRow: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: 1, borderBottomColor: withAlpha(ucapsaBrand.colors.premiumActionText, 0.08) },
  rankingRowLast: { borderBottomWidth: 0 },
  rankingRowCurrent: { marginHorizontal: -6, paddingHorizontal: 6, borderRadius: 14, backgroundColor: ucapsaBrand.colors.premiumBurgundySoft },
  rankingRank: { width: 28, color: ucapsaBrand.colors.premiumActionText, fontSize: 14, lineHeight: 18, fontWeight: '900', textAlign: 'center' },
  rankingDogIcon: { width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: ucapsaBrand.colors.premiumSurfaceAlt },
  rankingCopy: { flex: 1, minWidth: 0 },
  rankingName: { color: ucapsaBrand.colors.premiumText, fontSize: 14, lineHeight: 18, fontWeight: '900' },
  rankingTier: { marginTop: 1, color: ucapsaBrand.colors.premiumMuted, fontSize: 10, lineHeight: 13, fontWeight: '700' },
  rankingPoints: { color: ucapsaBrand.colors.premiumActionText, fontSize: 13, lineHeight: 17, fontWeight: '900' },
  actionsCard: { borderRadius: 20, borderWidth: 1, borderColor: ucapsaBrand.colors.premiumBorder, backgroundColor: ucapsaBrand.colors.premiumSurface, overflow: 'hidden' },
  actionRow: { minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 13, paddingVertical: 8 },
  actionRowBorder: { borderTopWidth: 1, borderTopColor: withAlpha(ucapsaBrand.colors.premiumActionText, 0.08) },
  actionIcon: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: ucapsaBrand.colors.premiumSurfaceAlt },
  actionText: { flex: 1, color: ucapsaBrand.colors.premiumText, fontSize: 14, lineHeight: 18, fontWeight: '900' },
});
