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
    color: '#0f172a',
    fontSize: 30,
    fontWeight: '900',
  },
  subtitle: {
    color: '#475569',
    fontSize: 16,
    lineHeight: 23,
    fontWeight: '700',
  },
  body: {
    color: '#334155',
    fontSize: 15,
    lineHeight: 22,
  },
  muted: {
    color: '#64748b',
    fontSize: 14,
    lineHeight: 21,
  },
  label: {
    color: '#334155',
    fontSize: 13,
    fontWeight: '900',
  },
  kicker: {
    color: '#0f766e',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
});
