import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { ucapsaBrand, withAlpha } from '../../constants/brand';
import { formatAchievementDate, type AchievementWithState } from '../../services/achievements.service';

const colorMap = {
  red: { main: ucapsaBrand.colors.red, soft: ucapsaBrand.colors.redSoft, dark: ucapsaBrand.colors.redDark },
  blue: { main: ucapsaBrand.colors.blue, soft: ucapsaBrand.colors.blueSoft, dark: ucapsaBrand.colors.blueDark },
  yellow: { main: ucapsaBrand.colors.gold, soft: ucapsaBrand.colors.goldPale, dark: ucapsaBrand.colors.goldDark },
  green: { main: ucapsaBrand.colors.green, soft: ucapsaBrand.colors.greenSoft, dark: ucapsaBrand.colors.greenDark },
  purple: { main: ucapsaBrand.colors.purple, soft: ucapsaBrand.colors.purpleSoft, dark: ucapsaBrand.colors.purpleDark },
  gray: { main: ucapsaBrand.colors.mutedNeutral, soft: ucapsaBrand.colors.graySoft, dark: ucapsaBrand.colors.grayDark },
} as const;

function getTone(item: AchievementWithState) {
  return colorMap[item.definition.color_key] ?? colorMap.gray;
}

function getAchievementRank(item: AchievementWithState) {
  return item.definition.sort_order || 0;
}

function sortAchievementsByLevel(items: AchievementWithState[]) {
  return [...items].sort((a, b) => getAchievementRank(a) - getAchievementRank(b));
}

const homeProgramProgressionRank: Record<string, number> = {
  puppy_completed: 0,
  comandos_basico_completed: 1,
  comandos_medio_completed: 2,
  comandos_avanzado_completed: 3,
};

function sortAchievementsForHome(items: AchievementWithState[]) {
  return [...items].sort((a, b) => {
    // En Inicio, primero se conserva la historia real ya conseguida.
    // El nivel mas alto completado va delante del anterior:
    // Avanzado > Intermedio > Basico > Puppy.
    if (a.unlocked !== b.unlocked) return a.unlocked ? -1 : 1;

    const programRankA = homeProgramProgressionRank[a.definition.code];
    const programRankB = homeProgramProgressionRank[b.definition.code];
    const aIsProgram = programRankA !== undefined;
    const bIsProgram = programRankB !== undefined;

    if (aIsProgram && bIsProgram) {
      return a.unlocked ? programRankB - programRankA : programRankA - programRankB;
    }

    // Los hitos de Puppy/Comandos tienen prioridad en el resumen de Inicio.
    if (aIsProgram !== bIsProgram) return aIsProgram ? -1 : 1;

    // Para futuros logros no ligados al programa, mantener el orden configurado.
    return getAchievementRank(a) - getAchievementRank(b);
  });
}

export function AchievementBadgeGrid({
  items,
  premium = false,
  maxItems,
  onSelect,
}: {
  items: AchievementWithState[];
  premium?: boolean;
  maxItems?: number;
  onSelect: (item: AchievementWithState) => void;
}) {
  const orderedItems = sortAchievementsByLevel(items);
  const visibleItems = maxItems ? orderedItems.slice(0, maxItems) : orderedItems;

  if (visibleItems.length === 0) {
    return (
      <View style={[styles.emptyBox, premium && styles.emptyBoxPremium]}>
        <Text style={[styles.emptyTitle, premium && styles.emptyTitlePremium]}>Sin medallas configuradas</Text>
        <Text style={[styles.emptyText, premium && styles.emptyTextPremium]}>Los logros todavia no estan disponibles.</Text>
      </View>
    );
  }

  return (
    <View style={styles.roadmap}>
      {visibleItems.map((item, index) => {
        const tone = getTone(item);
        const lockedColor = premium ? ucapsaBrand.colors.premiumMuted : ucapsaBrand.colors.gray;
        const lockedBackground = premium ? ucapsaBrand.colors.premiumSurfaceAlt : ucapsaBrand.colors.graySoft;
        const isLast = index === visibleItems.length - 1;
        return (
          <View key={item.definition.code} style={styles.roadmapRow}>
            <View style={styles.roadmapRail}>
              <View style={[
                styles.roadmapNode,
                { backgroundColor: item.unlocked ? tone.soft : lockedBackground, borderColor: item.unlocked ? tone.main : premium ? ucapsaBrand.colors.premiumBorder : ucapsaBrand.colors.textLight },
              ]}>
                <MaterialCommunityIcons name={item.definition.icon as any} size={24} color={item.unlocked ? tone.dark : lockedColor} />
              </View>
              {!isLast ? <View style={[styles.roadmapLine, { backgroundColor: item.unlocked ? tone.main : premium ? ucapsaBrand.colors.premiumBorder : ucapsaBrand.colors.borderNeutral }]} /> : null}
            </View>
            <Pressable
              style={({ pressed }) => [
                styles.roadmapCard,
                premium && styles.roadmapCardPremium,
                item.unlocked ? { borderColor: tone.main } : null,
                pressed && styles.pressed,
              ]}
              onPress={() => onSelect(item)}
            >
              <View style={styles.roadmapCardTop}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.roadmapStep, { color: item.unlocked ? tone.dark : lockedColor }]}>ETAPA {index + 1}</Text>
                  <Text style={[styles.roadmapTitle, premium && styles.roadmapTitlePremium, !item.unlocked && styles.roadmapTitleLocked, premium && !item.unlocked && styles.roadmapTitleLockedPremium]}>
                    {item.definition.title}
                  </Text>
                </View>
                <View style={[styles.statePill, { backgroundColor: item.unlocked ? tone.soft : lockedBackground }]}>
                  <Text style={[styles.badgeState, item.unlocked ? { color: tone.dark } : styles.badgeStateLocked, premium && !item.unlocked && styles.badgeStateLockedPremium]}>
                    {item.unlocked ? 'COMPLETADO' : 'SIGUIENTE'}
                  </Text>
                </View>
              </View>
              <Text style={[styles.roadmapHint, premium && styles.roadmapHintPremium]}>
                {item.unlocked ? item.definition.unlocked_title || 'Hito completado' : item.definition.description || 'Completa esta etapa para desbloquear la medalla.'}
              </Text>
              {item.unlocked ? (
                <Text style={[styles.roadmapDate, { color: item.unlocked ? tone.dark : lockedColor }]}>{formatAchievementDate(item.achievement?.awarded_at)}</Text>
              ) : null}
            </Pressable>
          </View>
        );
      })}
    </View>
  );
}


export function AchievementMiniRow({
  items,
  premium = false,
  maxItems = 4,
  label = 'Tus logros',
  onPress,
}: {
  items: AchievementWithState[];
  premium?: boolean;
  maxItems?: number;
  label?: string;
  onPress: () => void;
}) {
  const visibleItems = sortAchievementsForHome(items).slice(0, maxItems);

  if (visibleItems.length === 0) return null;

  return (
    <Pressable style={[styles.miniRow, premium && styles.miniRowPremium]} onPress={onPress}>
      {visibleItems.map((item) => {
        const tone = getTone(item);
        return (
          <View
            key={item.definition.code}
            style={[
              styles.miniSeal,
              premium && styles.miniSealPremium,
              item.unlocked ? { backgroundColor: tone.soft, borderColor: tone.main } : styles.miniSealLocked,
            ]}
          >
            <MaterialCommunityIcons name={item.definition.icon as any} size={18} color={item.unlocked ? tone.dark : ucapsaBrand.colors.gray} />
          </View>
        );
      })}
      <Text style={[styles.miniLabel, premium && styles.miniLabelPremium]}>{label}</Text>
      <MaterialCommunityIcons name="chevron-right" size={18} color={premium ? ucapsaBrand.colors.premiumAction : ucapsaBrand.colors.red} />
    </Pressable>
  );
}

export function AchievementDetailModal({
  item,
  premium = false,
  onClose,
}: {
  item: AchievementWithState | null;
  premium?: boolean;
  onClose: () => void;
}) {
  if (!item) return null;
  const tone = getTone(item);
  const unlockedTitle = item.definition.unlocked_title || item.definition.title;
  const lockedTitle = item.definition.title;

  return (
    <Modal visible={Boolean(item)} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={[styles.modalCard, premium && styles.modalCardPremium]}>
          <View style={[styles.modalIcon, { backgroundColor: item.unlocked ? tone.soft : ucapsaBrand.colors.graySoft, borderColor: item.unlocked ? tone.main : ucapsaBrand.colors.textLight }]}>
            <MaterialCommunityIcons name={item.definition.icon as any} size={44} color={item.unlocked ? tone.dark : ucapsaBrand.colors.gray} />
          </View>

          <Text style={[styles.modalKicker, premium && styles.modalKickerPremium]}>{item.unlocked ? 'Logro desbloqueado' : 'Logro pendiente'}</Text>
          <Text style={[styles.modalTitle, premium && styles.modalTitlePremium]}>{item.unlocked ? unlockedTitle : lockedTitle}</Text>
          <Text style={[styles.modalText, premium && styles.modalTextPremium]}>
            {item.unlocked
              ? item.definition.unlocked_description || item.definition.description || 'Medalla obtenida en UCAPSA.'
              : item.definition.description || 'Completa el programa para desbloquear esta medalla.'}
          </Text>

          {item.unlocked ? (
            <Text style={[styles.modalDate, premium && styles.modalDatePremium]}>Obtenida: {formatAchievementDate(item.achievement?.awarded_at)}</Text>
          ) : null}

          <Pressable style={[styles.closeButton, premium && styles.closeButtonPremium]} onPress={onClose}>
            <Text style={[styles.closeButtonText, premium && styles.closeButtonTextPremium]}>Cerrar</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

export function AchievementSummary({ items, premium = false, onPress }: { items: AchievementWithState[]; premium?: boolean; onPress?: () => void }) {
  const unlocked = items.filter((item) => item.unlocked).length;
  const total = items.length;
  const content = (
    <>
      <View style={[styles.summaryIcon, premium && styles.summaryIconPremium]}>
        <MaterialCommunityIcons name="medal" size={24} color={premium ? ucapsaBrand.colors.premiumActionText : ucapsaBrand.colors.red} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.summaryTitle, premium && styles.summaryTitlePremium]}>Logros UCAPSA</Text>
        <Text style={[styles.summaryText, premium && styles.summaryTextPremium]}>{unlocked} de {total} medallas desbloqueadas</Text>
      </View>
      {onPress ? <MaterialCommunityIcons name="chevron-right" size={24} color={premium ? ucapsaBrand.colors.premiumAction : ucapsaBrand.colors.red} /> : null}
    </>
  );

  if (onPress) {
    return <Pressable style={[styles.summaryCard, premium && styles.summaryCardPremium]} onPress={onPress}>{content}</Pressable>;
  }

  return <View style={[styles.summaryCard, premium && styles.summaryCardPremium]}>{content}</View>;
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  roadmap: { gap: 0 },
  roadmapRow: { flexDirection: 'row', alignItems: 'stretch', gap: 12 },
  roadmapRail: { width: 54, alignItems: 'center' },
  roadmapNode: { width: 50, height: 50, borderRadius: 18, borderWidth: 2, alignItems: 'center', justifyContent: 'center', zIndex: 2 },
  roadmapLine: { width: 3, flex: 1, minHeight: 58, borderRadius: 999, marginVertical: 3 },
  roadmapCard: { flex: 1, minHeight: 110, gap: 7, borderRadius: 22, backgroundColor: ucapsaBrand.colors.surface, borderWidth: 1, borderColor: ucapsaBrand.colors.borderNeutral, padding: 14, marginBottom: 12 },
  roadmapCardPremium: { backgroundColor: ucapsaBrand.colors.premiumSurface, borderColor: ucapsaBrand.colors.premiumBorder },
  roadmapCardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  roadmapStep: { fontSize: 9, lineHeight: 12, fontWeight: '900', letterSpacing: 0.9 },
  roadmapTitle: { marginTop: 2, color: ucapsaBrand.colors.cameraDark, fontSize: 16, lineHeight: 20, fontWeight: '900' },
  roadmapTitlePremium: { color: ucapsaBrand.colors.premiumText },
  roadmapTitleLocked: { color: ucapsaBrand.colors.mutedNeutral },
  roadmapTitleLockedPremium: { color: ucapsaBrand.colors.premiumMuted },
  roadmapHint: { color: ucapsaBrand.colors.muted, fontSize: 11, lineHeight: 16, fontWeight: '700' },
  roadmapHintPremium: { color: ucapsaBrand.colors.premiumMuted },
  roadmapDate: { fontSize: 10, lineHeight: 14, fontWeight: '900' },
  badgeCard: { width: '48%', minHeight: 132, alignItems: 'stretch', justifyContent: 'space-between', gap: 9, padding: 13, borderRadius: 22, backgroundColor: ucapsaBrand.colors.surface, borderWidth: 1, borderColor: ucapsaBrand.colors.borderNeutral },
  badgeCardPremium: { backgroundColor: ucapsaBrand.colors.premiumSurface, borderColor: ucapsaBrand.colors.premiumBorder },
  badgeCardLocked: { opacity: 0.9 },
  badgeTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  iconSeal: { width: 46, height: 46, borderRadius: 16, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: withAlpha(ucapsaBrand.colors.surface, 0.6) },
  statePill: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 5 },
  badgeTitle: { color: ucapsaBrand.colors.cameraDark, fontSize: 14, lineHeight: 18, fontWeight: '900', textAlign: 'left' },
  badgeTitlePremium: { color: ucapsaBrand.colors.premiumText },
  badgeTitleLocked: { color: ucapsaBrand.colors.mutedNeutral },
  badgeTitleLockedPremium: { color: ucapsaBrand.colors.premiumMuted },
  badgeHint: { color: ucapsaBrand.colors.muted, fontSize: 10, lineHeight: 14, fontWeight: '700' },
  badgeHintPremium: { color: ucapsaBrand.colors.premiumMuted },
  badgeState: { fontSize: 9, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.5 },
  badgeStateLocked: { color: ucapsaBrand.colors.gray },
  badgeStateLockedPremium: { color: ucapsaBrand.colors.premiumMuted },
  pressed: { opacity: 0.86, transform: [{ scale: 0.99 }] },
  emptyBox: { gap: 5, padding: 16, borderRadius: 20, backgroundColor: ucapsaBrand.colors.surface, borderWidth: 1, borderColor: ucapsaBrand.colors.border },
  emptyBoxPremium: { backgroundColor: ucapsaBrand.colors.premiumSurface, borderColor: ucapsaBrand.colors.premiumBorder },
  emptyTitle: { color: ucapsaBrand.colors.text, fontSize: 15, fontWeight: '900' },
  emptyTitlePremium: { color: ucapsaBrand.colors.premiumText },
  emptyText: { color: ucapsaBrand.colors.muted, fontSize: 13, lineHeight: 18, fontWeight: '700' },
  emptyTextPremium: { color: ucapsaBrand.colors.premiumMuted },
  miniRow: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 12, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 999, backgroundColor: ucapsaBrand.colors.surface, borderWidth: 1, borderColor: ucapsaBrand.colors.border },
  miniRowPremium: { backgroundColor: ucapsaBrand.colors.premiumSurface, borderColor: ucapsaBrand.colors.premiumBorder },
  miniSeal: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  miniSealPremium: { borderColor: ucapsaBrand.colors.premiumBorder },
  miniSealLocked: { backgroundColor: ucapsaBrand.colors.graySoft, borderColor: ucapsaBrand.colors.textLight, opacity: 0.72 },
  miniLabel: { color: ucapsaBrand.colors.muted, fontSize: 13, fontWeight: '900', marginLeft: 1 },
  miniLabelPremium: { color: ucapsaBrand.colors.premiumMuted },
  modalBackdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: withAlpha(ucapsaBrand.colors.cameraDark, 0.48) },
  modalCard: { width: '100%', gap: 10, alignItems: 'center', padding: 22, borderRadius: 30, backgroundColor: ucapsaBrand.colors.surface, borderWidth: 1, borderColor: ucapsaBrand.colors.border },
  modalCardPremium: { backgroundColor: ucapsaBrand.colors.premiumSurface, borderColor: ucapsaBrand.colors.premiumBorder },
  modalIcon: { width: 82, height: 82, borderRadius: 41, alignItems: 'center', justifyContent: 'center', borderWidth: 2, marginBottom: 6 },
  modalKicker: { color: ucapsaBrand.colors.red, fontSize: 12, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.8 },
  modalKickerPremium: { color: ucapsaBrand.colors.premiumAction },
  modalTitle: { color: ucapsaBrand.colors.text, fontSize: 25, fontWeight: '900', textAlign: 'center' },
  modalTitlePremium: { color: ucapsaBrand.colors.premiumText },
  modalText: { color: ucapsaBrand.colors.muted, fontSize: 14, lineHeight: 20, fontWeight: '700', textAlign: 'center' },
  modalTextPremium: { color: ucapsaBrand.colors.premiumMuted },
  modalDate: { color: ucapsaBrand.colors.redDark, fontSize: 13, fontWeight: '900', marginTop: 4 },
  modalDatePremium: { color: ucapsaBrand.colors.premiumAction },
  closeButton: { width: '100%', alignItems: 'center', borderRadius: 18, paddingVertical: 14, backgroundColor: ucapsaBrand.colors.red, marginTop: 8 },
  closeButtonPremium: { backgroundColor: ucapsaBrand.colors.gold },
  closeButtonText: { color: ucapsaBrand.colors.surface, fontSize: 15, fontWeight: '900' },
  closeButtonTextPremium: { color: ucapsaBrand.colors.redDeeper },
  summaryCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 15, borderRadius: 22, backgroundColor: ucapsaBrand.colors.surface, borderWidth: 1, borderColor: ucapsaBrand.colors.border },
  summaryCardPremium: { backgroundColor: ucapsaBrand.colors.premiumSurface, borderColor: ucapsaBrand.colors.premiumBorder },
  summaryIcon: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', backgroundColor: ucapsaBrand.colors.redSoft },
  summaryIconPremium: { backgroundColor: ucapsaBrand.colors.premiumSurfaceAlt, borderWidth: 1, borderColor: ucapsaBrand.colors.premiumBorder },
  summaryTitle: { color: ucapsaBrand.colors.text, fontSize: 16, fontWeight: '900' },
  summaryTitlePremium: { color: ucapsaBrand.colors.premiumText },
  summaryText: { color: ucapsaBrand.colors.muted, fontSize: 13, fontWeight: '800', marginTop: 2 },
  summaryTextPremium: { color: ucapsaBrand.colors.premiumMuted },
});
