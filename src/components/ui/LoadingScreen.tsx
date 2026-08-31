import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { ucapsaBrand } from '../../constants/brand';

type LoadingScreenProps = {
  message?: string;
  onRetry?: () => void;
};

export function LoadingScreen({ message = 'Cargando...', onRetry }: LoadingScreenProps) {
  const hasError = Boolean(onRetry);

  return (
    <View style={styles.container}>
      <View style={styles.logoMark}>
        <Text style={styles.logoText}>U</Text>
      </View>
      {hasError ? null : <ActivityIndicator color={ucapsaBrand.colors.red} />}
      <Text style={[styles.message, hasError && styles.errorMessage]}>{message}</Text>
      {onRetry ? (
        <Pressable accessibilityRole="button" style={styles.retryButton} onPress={onRetry}>
          <Text style={styles.retryButtonText}>Reintentar</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    gap: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ucapsaBrand.colors.background,
    padding: 24,
  },
  logoMark: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ucapsaBrand.colors.red,
    shadowColor: ucapsaBrand.colors.redDark,
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 3,
  },
  logoText: {
    color: ucapsaBrand.colors.surface,
    fontSize: 28,
    fontWeight: '900',
  },
  message: {
    maxWidth: 340,
    color: ucapsaBrand.colors.muted,
    fontSize: 14,
    fontWeight: '800',
    lineHeight: 20,
    textAlign: 'center',
  },
  errorMessage: {
    color: ucapsaBrand.colors.text,
  },
  retryButton: {
    minHeight: 48,
    minWidth: 150,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    backgroundColor: ucapsaBrand.colors.red,
    paddingHorizontal: 20,
  },
  retryButtonText: {
    color: ucapsaBrand.colors.surface,
    fontSize: 15,
    fontWeight: '900',
  },
});
