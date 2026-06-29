import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSession } from '../../hooks/useSession';

export default function MembershipScreen() {
  const router = useRouter();
  const { user, role, isAdmin } = useSession();

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <View style={styles.heroIcon}>
            <MaterialIcons name="badge" size={28} color="#0f766e" />
          </View>
          <View style={styles.heroText}>
            <Text style={styles.kicker}>Mi UCAPSA</Text>
            <Text style={styles.title}>Membresia y credencial</Text>
            <Text style={styles.subtitle}>Aqui viviran tu credencial digital, QR, estado de membresia y pagos manuales.</Text>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardLabel}>Estado actual</Text>
          <Text style={styles.cardValue}>{user ? `Cuenta activa - ${role ?? 'client'}` : 'Visitante sin sesion'}</Text>
          <Text style={styles.cardText}>La validacion real de socio y QR entrara en la siguiente fase de membresias.</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardLabel}>Credencial</Text>
          <Text style={styles.cardValue}>QR de socio</Text>
          <Text style={styles.cardText}>El QR no guardara datos personales. Usara un token consultado en Supabase.</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardLabel}>Pagos</Text>
          <Text style={styles.cardValue}>Pagos manuales</Text>
          <Text style={styles.cardText}>En el MVP no cobraremos en linea. El admin podra marcar pagos como pendientes o pagados.</Text>
        </View>

        {!user ? (
          <Pressable onPress={() => router.push('/auth/login' as never)} style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>Iniciar sesion</Text>
          </Pressable>
        ) : null}

        {isAdmin ? (
          <Pressable onPress={() => router.push('/admin' as never)} style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonText}>Abrir panel admin</Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#f8fafc' },
  container: { flex: 1, backgroundColor: '#f8fafc' },
  content: { gap: 16, paddingHorizontal: 20, paddingTop: 22, paddingBottom: 110 },
  hero: { flexDirection: 'row', gap: 14, padding: 18, borderRadius: 24, backgroundColor: '#0f172a' },
  heroIcon: { width: 54, height: 54, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: '#ccfbf1' },
  heroText: { flex: 1, gap: 6 },
  kicker: { color: '#5eead4', fontSize: 12, fontWeight: '900', letterSpacing: 1, textTransform: 'uppercase' },
  title: { color: '#ffffff', fontSize: 22, fontWeight: '900' },
  subtitle: { color: '#cbd5e1', fontSize: 14, lineHeight: 20 },
  card: { gap: 8, padding: 18, borderRadius: 20, backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e2e8f0' },
  cardLabel: { color: '#0f766e', fontSize: 12, fontWeight: '900', letterSpacing: 1, textTransform: 'uppercase' },
  cardValue: { color: '#0f172a', fontSize: 20, fontWeight: '900' },
  cardText: { color: '#64748b', fontSize: 14, lineHeight: 20 },
  primaryButton: { alignItems: 'center', justifyContent: 'center', minHeight: 52, borderRadius: 16, backgroundColor: '#0f766e' },
  primaryButtonText: { color: '#ffffff', fontSize: 16, fontWeight: '900' },
  secondaryButton: { alignItems: 'center', justifyContent: 'center', minHeight: 52, borderRadius: 16, backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#cbd5e1' },
  secondaryButtonText: { color: '#0f172a', fontSize: 16, fontWeight: '900' },
});
