import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { ucapsaBrand } from '../../constants/brand';

type LoadingScreenProps = {
  message?: string;
};

export function LoadingScreen({ message = 'Cargando...' }: LoadingScreenProps) {
  return (
    <View style={styles.container}>
      <View style={styles.logoMark}>
        <Text style={styles.logoText}>U</Text>
      </View>
      <ActivityIndicator color={ucapsaBrand.colors.red} />
      <Text style={styles.message}>{message}</Text>
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
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '900',
  },
  message: {
    color: ucapsaBrand.colors.muted,
    fontSize: 14,
    fontWeight: '800',
  },
});
