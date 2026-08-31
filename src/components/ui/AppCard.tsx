import { ucapsaBrand } from '../../constants/brand';
import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

type AppCardProps = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
};

export function AppCard({ children, style }: AppCardProps) {
  return <View style={[styles.card, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 22,
    backgroundColor: ucapsaBrand.colors.surface,
    borderWidth: 1,
    borderColor: ucapsaBrand.colors.borderNeutral,
    padding: 16,
  },
});
