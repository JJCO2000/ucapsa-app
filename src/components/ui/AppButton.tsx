import { ucapsaBrand } from '../../constants/brand';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';

type AppButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

type AppButtonProps = {
  label?: string;
  children?: ReactNode;
  onPress?: () => void;
  disabled?: boolean;
  variant?: AppButtonVariant;
  style?: StyleProp<ViewStyle>;
};

export function AppButton({
  label,
  children,
  onPress,
  disabled = false,
  variant = 'primary',
  style,
}: AppButtonProps) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        styles[variant],
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
        style,
      ]}
    >
      <Text style={[styles.text, styles[`${variant}Text` as const]]}>
        {children ?? label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  primary: {
    backgroundColor: ucapsaBrand.colors.green,
  },
  secondary: {
    backgroundColor: ucapsaBrand.colors.surface,
    borderWidth: 1,
    borderColor: ucapsaBrand.colors.textLight,
  },
  danger: {
    backgroundColor: ucapsaBrand.colors.red,
  },
  ghost: {
    backgroundColor: 'transparent',
  },
  disabled: {
    opacity: 0.55,
  },
  pressed: {
    opacity: 0.86,
    transform: [{ scale: 0.995 }],
  },
  text: {
    fontSize: 15,
    fontWeight: '900',
  },
  primaryText: {
    color: ucapsaBrand.colors.surface,
  },
  secondaryText: {
    color: ucapsaBrand.colors.cameraDark,
  },
  dangerText: {
    color: ucapsaBrand.colors.surface,
  },
  ghostText: {
    color: ucapsaBrand.colors.green,
  },
});
