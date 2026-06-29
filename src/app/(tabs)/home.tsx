import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useSession } from '../../hooks/useSession';

export default function HomeScreen() {
  const router = useRouter();
  const { user, profile, role } = useSession();

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.eyebrow}>UCAPSA</Text>
      <Text style={styles.title}>
        {user ? `Hola, ${profile?.full_name || 'cliente UCAPSA'}` : 'Bienvenido a UCAPSA'}
      </Text>
      <Text style={styles.subtitle}>
        Comunicacion oficial, eventos, membresia y pagos manuales en una sola app.
      </Text>

      <View style={styles.statusCard}>
        <Text style={styles.statusLabel}>Estado</Text>
        <Text style={styles.statusValue}>
          {user ? `Sesion activa - ${role ?? 'perfil pendiente'}` : 'Visitante'}
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Accesos rapidos</Text>

        <Pressable onPress={() => router.push('/announcements' as never)} style={styles.actionCard}>
          <Text style={styles.actionTitle}>Anuncios</Text>
          <Text style={styles.actionText}>Consulta comunicados oficiales.</Text>
        </Pressable>

        <Pressable onPress={() => router.push('/calendar' as never)} style={styles.actionCard}>
          <Text style={styles.actionTitle}>Calendario</Text>
          <Text style={styles.actionText}>Revisa eventos y actividades.</Text>
        </Pressable>

        <Pressable onPress={() => router.push('/membership' as never)} style={styles.actionCard}>
          <Text style={styles.actionTitle}>Mi UCAPSA</Text>
          <Text style={styles.actionText}>Membresia, QR y pagos manuales.</Text>
        </Pressable>
      </View>

      {!user && (
        <Pressable onPress={() => router.push('/auth/login' as never)} style={styles.primaryButton}>
          <Text style={styles.primaryButtonText}>Iniciar sesion</Text>
        </Pressable>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    padding: 24,
    backgroundColor: '#f8fafc',
  },
  eyebrow: {
    color: '#0f766e',
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 1,
    marginBottom: 10,
  },
  title: {
    color: '#0f172a',
    fontSize: 32,
    fontWeight: '900',
    marginBottom: 8,
  },
  subtitle: {
    color: '#475569',
    fontSize: 16,
    lineHeight: 24,
    marginBottom: 18,
  },
  statusCard: {
    backgroundColor: '#0f172a',
    borderRadius: 22,
    marginBottom: 24,
    padding: 18,
  },
  statusLabel: {
    color: '#5eead4',
    fontSize: 13,
    fontWeight: '900',
    marginBottom: 6,
  },
  statusValue: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '900',
  },
  section: {
    gap: 12,
  },
  sectionTitle: {
    color: '#0f172a',
    fontSize: 18,
    fontWeight: '900',
    marginBottom: 4,
  },
  actionCard: {
    backgroundColor: '#ffffff',
    borderColor: '#e2e8f0',
    borderRadius: 20,
    borderWidth: 1,
    padding: 18,
  },
  actionTitle: {
    color: '#0f172a',
    fontSize: 18,
    fontWeight: '900',
    marginBottom: 4,
  },
  actionText: {
    color: '#64748b',
    fontSize: 14,
    lineHeight: 20,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: '#0f766e',
    borderRadius: 16,
    justifyContent: 'center',
    minHeight: 52,
    marginTop: 24,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '900',
  },
});
