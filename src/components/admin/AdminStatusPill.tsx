import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { StyleSheet, Text, View } from 'react-native';

import { ucapsaBrand } from '../../constants/brand';

export type AdminStatusTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'purple';

const tones: Record<AdminStatusTone, { background: string; border: string; text: string; icon: keyof typeof MaterialIcons.glyphMap }> = {
  neutral: { background: ucapsaBrand.colors.graySoft, border: ucapsaBrand.colors.borderNeutral, text: ucapsaBrand.colors.grayDark, icon: 'circle' },
  info: { background: ucapsaBrand.colors.blueSoft, border: ucapsaBrand.colors.blue, text: ucapsaBrand.colors.blueDark, icon: 'info' },
  success: { background: ucapsaBrand.colors.successSoft, border: ucapsaBrand.colors.successBorder, text: ucapsaBrand.colors.successDark, icon: 'check-circle' },
  warning: { background: ucapsaBrand.colors.goldPale, border: ucapsaBrand.colors.gold, text: ucapsaBrand.colors.goldDark, icon: 'schedule' },
  danger: { background: ucapsaBrand.colors.dangerSoft, border: ucapsaBrand.colors.dangerBorder, text: ucapsaBrand.colors.danger, icon: 'error' },
  purple: { background: ucapsaBrand.colors.purpleSoft, border: ucapsaBrand.colors.purple, text: ucapsaBrand.colors.purpleDark, icon: 'stars' },
};

export function AdminStatusPill({
  label,
  tone = 'neutral',
  icon,
}: {
  label: string;
  tone?: AdminStatusTone;
  icon?: keyof typeof MaterialIcons.glyphMap;
}) {
  const palette = tones[tone];
  return (
    <View
      accessibilityLabel={label}
      style={[styles.pill, { backgroundColor: palette.background, borderColor: palette.border }]}
    >
      <MaterialIcons name={icon ?? palette.icon} size={13} color={palette.text} />
      <Text style={[styles.text, { color: palette.text }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    minHeight: 28,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  text: { fontSize: 10, lineHeight: 13, fontWeight: '900' },
});
