import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
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
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.center}>
          <ActivityIndicator color="#0f766e" />
          <Text style={styles.muted}>Cargando perfil...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!user) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScrollView style={styles.container} contentContainerStyle={styles.content}>
          <View style={styles.hero}>
            <View style={styles.heroIcon}>
              <MaterialIcons name="person" size={28} color="#0f766e" />
            </View>
            <View style={styles.heroText}>
              <Text style={styles.kicker}>Perfil</Text>
              <Text style={styles.title}>Aun no has iniciado sesion</Text>
              <Text style={styles.subtitle}>Inicia sesion para ver tu perfil, membresia y pagos.</Text>
            </View>
          </View>

          <Pressable onPress={() => router.push('/auth/login' as never)} style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>Iniciar sesion</Text>
          </Pressable>

          <Pressable onPress={() => router.push('/auth/register' as never)} style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonText}>Crear cuenta</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <View style={styles.heroIcon}>
            <MaterialIcons name="person" size={28} color="#0f766e" />
          </View>
          <View style={styles.heroText}>
            <Text style={styles.kicker}>Perfil</Text>
            <Text style={styles.title}>{profile?.full_name || user.email}</Text>
            <Text style={styles.subtitle}>{user.email}</Text>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardLabel}>Rol actual</Text>
          <Text style={styles.cardValue}>{role ?? 'Sin perfil cargado'}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardLabel}>Estado de acceso</Text>
          <Text style={styles.cardValue}>{isAdmin ? 'Administrador UCAPSA' : 'Cliente / Socio'}</Text>
        </View>

        {isAdmin ? (
          <Pressable onPress={() => router.push('/admin' as never)} style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>Abrir panel admin</Text>
          </Pressable>
        ) : null}

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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#f8fafc' },
  container: { flex: 1, backgroundColor: '#f8fafc' },
  content: { gap: 16, paddingHorizontal: 20, paddingTop: 22, paddingBottom: 110 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: '#f8fafc' },
  muted: { color: '#64748b', fontSize: 14, lineHeight: 20 },
  hero: { flexDirection: 'row', gap: 14, padding: 18, borderRadius: 24, backgroundColor: '#0f172a' },
  heroIcon: { width: 54, height: 54, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: '#ccfbf1' },
  heroText: { flex: 1, gap: 6 },
  kicker: { color: '#5eead4', fontSize: 12, fontWeight: '900', letterSpacing: 1, textTransform: 'uppercase' },
  title: { color: '#ffffff', fontSize: 22, fontWeight: '900' },
  subtitle: { color: '#cbd5e1', fontSize: 14, lineHeight: 20 },
  card: { gap: 6, padding: 18, borderRadius: 20, backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e2e8f0' },
  cardLabel: { color: '#64748b', fontSize: 13, fontWeight: '800' },
  cardValue: { color: '#0f172a', fontSize: 18, fontWeight: '900' },
  primaryButton: { alignItems: 'center', justifyContent: 'center', minHeight: 52, borderRadius: 16, backgroundColor: '#0f766e' },
  primaryButtonText: { color: '#ffffff', fontSize: 16, fontWeight: '900' },
  secondaryButton: { alignItems: 'center', justifyContent: 'center', minHeight: 52, borderRadius: 16, backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#cbd5e1' },
  secondaryButtonText: { color: '#0f172a', fontSize: 16, fontWeight: '900' },
  dangerButton: { alignItems: 'center', justifyContent: 'center', minHeight: 52, borderRadius: 16, backgroundColor: '#fee2e2' },
  dangerButtonText: { color: '#991b1b', fontSize: 16, fontWeight: '900' },
});
