import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { ucapsaBrand } from '../../constants/brand';
import { formatAchievementDate, type AchievementWithState } from '../../services/achievements.service';

const colorMap = {
  red: { main: '#C91F37', soft: '#FFE8EC', dark: '#8F1324' },
  blue: { main: '#2563EB', soft: '#EAF1FF', dark: '#1D4ED8' },
  yellow: { main: '#FACC15', soft: '#FFF7CC', dark: '#7A3B00' },
  green: { main: '#0f766e', soft: '#ccfbf1', dark: '#134e4a' },
  purple: { main: '#7C3AED', soft: '#EDE9FE', dark: '#5B21B6' },
  gray: { main: '#64748b', soft: '#f1f5f9', dark: '#334155' },
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
        <Text style={[styles.emptyText, premium && styles.emptyTextPremium]}>Ejecuta el SQL de logros para activar las medallas UCAPSA.</Text>
      </View>
    );
  }

  return (
    <View style={styles.grid}>
      {visibleItems.map((item) => {
        const tone = getTone(item);
        return (
          <Pressable
            key={item.definition.code}
            style={({ pressed }) => [
              styles.badgeCard,
              premium && styles.badgeCardPremium,
              item.unlocked ? { borderColor: tone.main } : styles.badgeCardLocked,
              pressed && styles.pressed,
            ]}
            onPress={() => onSelect(item)}
          >
            <View style={[styles.iconSeal, { backgroundColor: item.unlocked ? tone.soft : '#F1F5F9' }]}>
              <MaterialCommunityIcons name={(item.unlocked ? item.definition.icon : 'lock') as any} size={28} color={item.unlocked ? tone.dark : '#94A3B8'} />
            </View>
            <Text numberOfLines={2} style={[styles.badgeTitle, premium && styles.badgeTitlePremium, !item.unlocked && styles.badgeTitleLocked]}>
              {item.definition.title}
            </Text>
            <Text style={[styles.badgeState, item.unlocked ? { color: tone.main } : styles.badgeStateLocked]}>
              {item.unlocked ? 'Desbloqueada' : 'Pendiente'}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}


export function AchievementMiniRow({
  items,
  premium = false,
  maxItems = 3,
  onPress,
}: {
  items: AchievementWithState[];
  premium?: boolean;
  maxItems?: number;
  onPress: () => void;
}) {
  const visibleItems = sortAchievementsByLevel(items).slice(0, maxItems);

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
            <MaterialCommunityIcons name={(item.unlocked ? item.definition.icon : 'lock') as any} size={18} color={item.unlocked ? tone.dark : '#94A3B8'} />
          </View>
        );
      })}
      <MaterialCommunityIcons name="chevron-right" size={18} color={premium ? '#FFE8B5' : ucapsaBrand.colors.red} />
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
          <View style={[styles.modalIcon, { backgroundColor: item.unlocked ? tone.soft : '#F1F5F9', borderColor: item.unlocked ? tone.main : '#CBD5E1' }]}>
            <MaterialCommunityIcons name={(item.unlocked ? item.definition.icon : 'lock') as any} size={44} color={item.unlocked ? tone.dark : '#94A3B8'} />
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

export function AchievementSummary({ items, premium = false, onPress }: { items: AchievementWithState[]; premium?: boolean; onPress: () => void }) {
  const unlocked = items.filter((item) => item.unlocked).length;
  const total = items.length;
  return (
    <Pressable style={[styles.summaryCard, premium && styles.summaryCardPremium]} onPress={onPress}>
      <View style={[styles.summaryIcon, premium && styles.summaryIconPremium]}>
        <MaterialCommunityIcons name="medal" size={24} color={premium ? '#7A1020' : ucapsaBrand.colors.red} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.summaryTitle, premium && styles.summaryTitlePremium]}>Logros UCAPSA</Text>
        <Text style={[styles.summaryText, premium && styles.summaryTextPremium]}>{unlocked} de {total || 4} medallas desbloqueadas</Text>
      </View>
      <MaterialCommunityIcons name="chevron-right" size={24} color={premium ? '#FFE8B5' : ucapsaBrand.colors.red} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  badgeCard: { width: '48%', minHeight: 142, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 13, borderRadius: 24, backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#E2E8F0' },
  badgeCardPremium: { backgroundColor: 'rgba(255,255,255,0.08)', borderColor: 'rgba(250,204,21,0.26)' },
  badgeCardLocked: { opacity: 0.72 },
  iconSeal: { width: 62, height: 62, borderRadius: 31, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.6)' },
  badgeTitle: { color: '#0F172A', fontSize: 14, fontWeight: '900', textAlign: 'center' },
  badgeTitlePremium: { color: '#FFFFFF' },
  badgeTitleLocked: { color: '#64748B' },
  badgeState: { fontSize: 11, fontWeight: '900', textTransform: 'uppercase' },
  badgeStateLocked: { color: '#94A3B8' },
  pressed: { opacity: 0.86, transform: [{ scale: 0.99 }] },
  emptyBox: { gap: 5, padding: 16, borderRadius: 20, backgroundColor: '#fff', borderWidth: 1, borderColor: ucapsaBrand.colors.border },
  emptyBoxPremium: { backgroundColor: 'rgba(255,255,255,0.08)', borderColor: 'rgba(250,204,21,0.26)' },
  emptyTitle: { color: ucapsaBrand.colors.text, fontSize: 15, fontWeight: '900' },
  emptyTitlePremium: { color: '#FFFFFF' },
  emptyText: { color: ucapsaBrand.colors.muted, fontSize: 13, lineHeight: 18, fontWeight: '700' },
  emptyTextPremium: { color: '#FFE3E8' },
  miniRow: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 12, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 999, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: ucapsaBrand.colors.border },
  miniRowPremium: { backgroundColor: 'rgba(255,255,255,0.10)', borderColor: 'rgba(250,204,21,0.28)' },
  miniSeal: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  miniSealPremium: { borderColor: 'rgba(250,204,21,0.34)' },
  miniSealLocked: { backgroundColor: '#F1F5F9', borderColor: '#CBD5E1', opacity: 0.72 },
  modalBackdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: 'rgba(15, 23, 42, 0.48)' },
  modalCard: { width: '100%', gap: 10, alignItems: 'center', padding: 22, borderRadius: 30, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: ucapsaBrand.colors.border },
  modalCardPremium: { backgroundColor: '#38111B', borderColor: 'rgba(250,204,21,0.34)' },
  modalIcon: { width: 82, height: 82, borderRadius: 41, alignItems: 'center', justifyContent: 'center', borderWidth: 2, marginBottom: 6 },
  modalKicker: { color: ucapsaBrand.colors.red, fontSize: 12, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.8 },
  modalKickerPremium: { color: '#FFE8B5' },
  modalTitle: { color: ucapsaBrand.colors.text, fontSize: 25, fontWeight: '900', textAlign: 'center' },
  modalTitlePremium: { color: '#FFFFFF' },
  modalText: { color: ucapsaBrand.colors.muted, fontSize: 14, lineHeight: 20, fontWeight: '700', textAlign: 'center' },
  modalTextPremium: { color: '#FFE3E8' },
  modalDate: { color: ucapsaBrand.colors.redDark, fontSize: 13, fontWeight: '900', marginTop: 4 },
  modalDatePremium: { color: '#FFE8B5' },
  closeButton: { width: '100%', alignItems: 'center', borderRadius: 18, paddingVertical: 14, backgroundColor: ucapsaBrand.colors.red, marginTop: 8 },
  closeButtonPremium: { backgroundColor: '#FACC15' },
  closeButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '900' },
  closeButtonTextPremium: { color: '#4A0710' },
  summaryCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 15, borderRadius: 22, backgroundColor: '#fff', borderWidth: 1, borderColor: ucapsaBrand.colors.border },
  summaryCardPremium: { backgroundColor: 'rgba(255,255,255,0.08)', borderColor: 'rgba(250,204,21,0.26)' },
  summaryIcon: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', backgroundColor: ucapsaBrand.colors.redSoft },
  summaryIconPremium: { backgroundColor: '#FFE8B5' },
  summaryTitle: { color: ucapsaBrand.colors.text, fontSize: 16, fontWeight: '900' },
  summaryTitlePremium: { color: '#FFFFFF' },
  summaryText: { color: ucapsaBrand.colors.muted, fontSize: 13, fontWeight: '800', marginTop: 2 },
  summaryTextPremium: { color: '#FFE3E8' },
});
