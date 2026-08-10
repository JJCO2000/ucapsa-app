import { StyleSheet, Text, type StyleProp, type TextStyle } from 'react-native';

type BadgeVariant = 'success' | 'info' | 'warning' | 'danger' | 'neutral';

type BadgeProps = {
  label: string;
  variant?: BadgeVariant;
  style?: StyleProp<TextStyle>;
};

export function Badge({ label, variant = 'neutral', style }: BadgeProps) {
  return <Text style={[styles.base, styles[variant], style]}>{label}</Text>;
}

const styles = StyleSheet.create({
  base: {
    overflow: 'hidden',
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    fontSize: 12,
    fontWeight: '900',
  },
  success: {
    color: '#166534',
    backgroundColor: '#dcfce7',
  },
  info: {
    color: '#0369a1',
    backgroundColor: '#e0f2fe',
  },
  warning: {
    color: '#92400e',
    backgroundColor: '#fef3c7',
  },
  danger: {
    color: '#991b1b',
    backgroundColor: '#fee2e2',
  },
  neutral: {
    color: '#334155',
    backgroundColor: '#f1f5f9',
  },
});

