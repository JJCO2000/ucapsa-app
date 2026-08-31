import { ucapsaBrand } from '../../constants/brand';
import type { ReactNode } from 'react';
import { StyleSheet, Text, type StyleProp, type TextStyle } from 'react-native';

type AppTextVariant = 'title' | 'subtitle' | 'body' | 'muted' | 'label' | 'kicker';

type AppTextProps = {
  children: ReactNode;
  variant?: AppTextVariant;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
};

export function AppText({
  children,
  variant = 'body',
  style,
  numberOfLines,
}: AppTextProps) {
  return (
    <Text numberOfLines={numberOfLines} style={[styles[variant], style]}>
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  title: {
    color: ucapsaBrand.colors.cameraDark,
    fontSize: 30,
    fontWeight: '900',
  },
  subtitle: {
    color: ucapsaBrand.colors.grayDark,
    fontSize: 16,
    lineHeight: 23,
    fontWeight: '700',
  },
  body: {
    color: ucapsaBrand.colors.grayDark,
    fontSize: 15,
    lineHeight: 22,
  },
  muted: {
    color: ucapsaBrand.colors.mutedNeutral,
    fontSize: 14,
    lineHeight: 21,
  },
  label: {
    color: ucapsaBrand.colors.grayDark,
    fontSize: 13,
    fontWeight: '900',
  },
  kicker: {
    color: ucapsaBrand.colors.green,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
});
