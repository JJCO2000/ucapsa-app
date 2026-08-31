import { ucapsaBrand } from '../../constants/brand';
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
    color: ucapsaBrand.colors.successDark,
    backgroundColor: ucapsaBrand.colors.greenSoft,
  },
  info: {
    color: ucapsaBrand.colors.green,
    backgroundColor: ucapsaBrand.colors.blueSoft,
  },
  warning: {
    color: ucapsaBrand.colors.warningDark,
    backgroundColor: ucapsaBrand.colors.goldPale,
  },
  danger: {
    color: ucapsaBrand.colors.danger,
    backgroundColor: ucapsaBrand.colors.premiumMuted,
  },
  neutral: {
    color: ucapsaBrand.colors.grayDark,
    backgroundColor: ucapsaBrand.colors.graySoft,
  },
});

