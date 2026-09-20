import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ucapsaBrand, withAlpha } from '../../constants/brand';
import { resolveUcapsaFormat } from '../../constants/ucapsaFormats';
import type { PracticeActivityEntry } from '../../services/practice.service';
import { formatPracticeDate, practiceDifficultyLabel } from '../../utils/practicePresentation';

export function PracticeHistoryRow({
  entry,
  premium,
  format,
  onPress,
}: {
  entry: PracticeActivityEntry;
  premium: boolean;
  format: ReturnType<typeof resolveUcapsaFormat>;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Ver práctica de ${entry.dogName || 'tu perro'} del ${formatPracticeDate(entry.completedAt)}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        {
          borderColor: premium ? withAlpha(ucapsaBrand.colors.gold, 0.2) : format.cardBorder,
          backgroundColor: format.cardBackground,
        },
        pressed && styles.pressed,
      ]}
    >
      <View style={[styles.icon, { backgroundColor: format.pillBackground }]}>
        <MaterialIcons name="pets" size={18} color={format.pillText} />
      </View>
      <View style={styles.copy}>
        <Text style={[styles.title, { color: format.cardText }]}>{formatPracticeDate(entry.completedAt)}</Text>
        <Text style={[styles.meta, { color: premium ? ucapsaBrand.colors.premiumMuted : format.muted }]}>
          {entry.dogName || 'Tu perro'} · {practiceDifficultyLabel(entry.difficulty)}{entry.syncStatus === 'pending' ? ' · por sincronizar' : entry.syncStatus === 'rejected' ? ' · requiere revisión' : ''}
        </Text>
      </View>
      <MaterialIcons name="chevron-right" size={22} color={premium ? ucapsaBrand.colors.premiumAction : format.accentDark} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 18, padding: 12 },
  pressed: { opacity: 0.78 },
  icon: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  copy: { flex: 1, minWidth: 0 },
  title: { fontSize: 13, lineHeight: 17, fontWeight: '900' },
  meta: { marginTop: 2, fontSize: 10, lineHeight: 14, fontWeight: '700' },
});
