import { Link } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Screen } from '../../components/ui/Screen';

export default function AdminDeferredScreen() {
  return (
    <Screen>
      <View style={styles.card}>
        <Text style={styles.eyebrow}>Admin</Text>
        <Text style={styles.title}>Pagos</Text>
        <Text style={styles.subtitle}>Los pagos manuales del MVP se registran desde el detalle de cada socio.</Text>

        <Text style={styles.note}>
          Este modulo no se muestra en el panel principal del MVP para evitar pantallas vacias. Por ahora, la operacion se concentra en Socios.
        </Text>

        <Link href="/admin/members" asChild>
          <Pressable style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>Ir a Socios</Text>
          </Pressable>
        </Link>

        <Link href="/admin" asChild>
          <Pressable style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonText}>Volver al panel</Text>
          </Pressable>
        </Link>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 12,
    borderRadius: 24,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 18,
  },
  eyebrow: {
    color: '#0f766e',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  title: {
    color: '#0f172a',
    fontSize: 28,
    fontWeight: '900',
  },
  subtitle: {
    color: '#475569',
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '700',
  },
  note: {
    color: '#64748b',
    fontSize: 14,
    lineHeight: 21,
  },
  primaryButton: {
    marginTop: 6,
    alignItems: 'center',
    borderRadius: 16,
    backgroundColor: '#0f766e',
    paddingVertical: 14,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '900',
  },
  secondaryButton: {
    alignItems: 'center',
    borderRadius: 16,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    paddingVertical: 14,
  },
  secondaryButtonText: {
    color: '#0f172a',
    fontSize: 15,
    fontWeight: '900',
  },
});
