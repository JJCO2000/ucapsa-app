import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

type LoadingScreenProps = {
  message?: string;
};

export function LoadingScreen({ message = 'Cargando...' }: LoadingScreenProps) {
  return (
    <View style={styles.container}>
      <ActivityIndicator />
      <Text style={styles.message}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    gap: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f8fafc',
    padding: 24,
  },
  message: {
    color: '#64748b',
    fontSize: 14,
    fontWeight: '700',
  },
});
