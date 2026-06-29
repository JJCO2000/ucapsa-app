import { useRouter } from 'expo-router';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { useSession } from '../../hooks/useSession';

export default function ProfileScreen() {
  const router = useRouter();
  const { loading, user, profile, role, isAdmin, signOut } = useSession();

  async function handleSignOut() {
    await signOut();
    router.replace('/home' as never);
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#0f766e" />
      </View>
    );
  }

  if (!user) {
    return (
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.eyebrow}>Perfil</Text>
        <Text style={styles.title}>Aun no has iniciado sesion</Text>
        <Text style={styles.text}>
          Inicia sesion para ver tu perfil, membresia y pagos.
        </Text>

        <Pressable onPress={() => router.push('/auth/login' as never)} style={styles.primaryButton}>
          <Text style={styles.primaryButtonText}>Iniciar sesion</Text>
        </Pressable>

        <Pressable onPress={() => router.push('/auth/register' as never)} style={styles.secondaryButton}>
          <Text style={styles.secondaryButtonText}>Crear cuenta</Text>
        </Pressable>
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.eyebrow}>Perfil</Text>
      <Text style={styles.title}>{profile?.full_name || user.email}</Text>
      <Text style={styles.text}>{user.email}</Text>

      <View style={styles.card}>
        <Text style={styles.cardLabel}>Rol actual</Text>
        <Text style={styles.cardValue}>{role ?? 'Sin perfil cargado'}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardLabel}>Estado de acceso</Text>
        <Text style={styles.cardValue}>
          {isAdmin ? 'Administrador UCAPSA' : 'Cliente / Socio'}
        </Text>
      </View>

      {isAdmin && (
        <Pressable onPress={() => router.push('/admin' as never)} style={styles.primaryButton}>
          <Text style={styles.primaryButtonText}>Abrir panel admin</Text>
        </Pressable>
      )}

      <Pressable
        onPress={() => {
          Alert.alert('Cerrar sesion', 'Seguro que quieres salir?', [
            { text: 'Cancelar', style: 'cancel' },
            { text: 'Salir', style: 'destructive', onPress: handleSignOut },
          ]);
        }}
        style={styles.dangerButton}
      >
        <Text style={styles.dangerButtonText}>Cerrar sesion</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f8fafc',
  },
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
    fontSize: 30,
    fontWeight: '900',
    marginBottom: 8,
  },
  text: {
    color: '#475569',
    fontSize: 16,
    lineHeight: 24,
    marginBottom: 20,
  },
  card: {
    backgroundColor: '#ffffff',
    borderColor: '#e2e8f0',
    borderRadius: 20,
    borderWidth: 1,
    marginBottom: 14,
    padding: 18,
  },
  cardLabel: {
    color: '#64748b',
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 6,
  },
  cardValue: {
    color: '#0f172a',
    fontSize: 18,
    fontWeight: '900',
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: '#0f766e',
    borderRadius: 16,
    justifyContent: 'center',
    minHeight: 52,
    marginTop: 10,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '900',
  },
  secondaryButton: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderColor: '#cbd5e1',
    borderRadius: 16,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 52,
    marginTop: 12,
  },
  secondaryButtonText: {
    color: '#0f172a',
    fontSize: 16,
    fontWeight: '900',
  },
  dangerButton: {
    alignItems: 'center',
    backgroundColor: '#fee2e2',
    borderRadius: 16,
    justifyContent: 'center',
    minHeight: 52,
    marginTop: 20,
  },
  dangerButtonText: {
    color: '#991b1b',
    fontSize: 16,
    fontWeight: '900',
  },
});
