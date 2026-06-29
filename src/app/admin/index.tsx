import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useSession } from '../../hooks/useSession';

const adminItems = [
  {
    title: 'Anuncios',
    description: 'Crear, editar, despublicar, archivar y eliminar comunicados.',
    route: '/admin/announcements',
    enabled: true,
  },
  {
    title: 'Eventos',
    description: 'Proxima fase: calendario oficial de UCAPSA.',
    route: '/admin/events',
    enabled: false,
  },
  {
    title: 'Socios',
    description: 'Proxima fase: altas, estatus y membresias.',
    route: '/admin/members',
    enabled: false,
  },
  {
    title: 'Pagos',
    description: 'Proxima fase: registro manual y seguimiento.',
    route: '/admin/payments',
    enabled: false,
  },
];

export default function AdminHomeScreen() {
  const { loading, isAdmin, role } = useSession();

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centerBox}>
          <Text style={styles.centerTitle}>Cargando permisos...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!isAdmin) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centerBox}>
          <Text style={styles.centerTitle}>Acceso restringido</Text>
          <Text style={styles.centerText}>Esta zona es solo para administradores de UCAPSA.</Text>
          <Pressable style={styles.primaryButton} onPress={() => router.replace('/home' as never)}>
            <Text style={styles.primaryButtonText}>Volver al inicio</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.header}>
          <Text style={styles.eyebrow}>Panel interno</Text>
          <Text style={styles.title}>Administracion UCAPSA</Text>
          <Text style={styles.subtitle}>Rol actual: {role}</Text>
        </View>

        <View style={styles.list}>
          {adminItems.map((item) => (
            <Pressable
              key={item.title}
              style={[styles.card, !item.enabled && styles.disabledCard]}
              disabled={!item.enabled}
              onPress={() => router.push(item.route as never)}
            >
              <View style={styles.cardTopRow}>
                <Text style={styles.cardTitle}>{item.title}</Text>
                <Text style={[styles.status, item.enabled ? styles.readyStatus : styles.soonStatus]}>
                  {item.enabled ? 'Listo' : 'Despues'}
                </Text>
              </View>
              <Text style={styles.cardDescription}>{item.description}</Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  container: {
    gap: 16,
    padding: 20,
    paddingBottom: 36,
  },
  header: {
    gap: 6,
  },
  eyebrow: {
    color: '#0f766e',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  title: {
    color: '#0f172a',
    fontSize: 30,
    fontWeight: '900',
  },
  subtitle: {
    color: '#475569',
    fontSize: 15,
  },
  list: {
    gap: 12,
  },
  card: {
    gap: 8,
    padding: 16,
    borderRadius: 20,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  disabledCard: {
    opacity: 0.62,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  cardTitle: {
    color: '#0f172a',
    fontSize: 18,
    fontWeight: '900',
  },
  cardDescription: {
    color: '#64748b',
    fontSize: 14,
    lineHeight: 20,
  },
  status: {
    overflow: 'hidden',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
    fontSize: 11,
    fontWeight: '900',
  },
  readyStatus: {
    backgroundColor: '#dcfce7',
    color: '#166534',
  },
  soonStatus: {
    backgroundColor: '#e2e8f0',
    color: '#475569',
  },
  centerBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 24,
  },
  centerTitle: {
    color: '#0f172a',
    fontSize: 22,
    fontWeight: '900',
    textAlign: 'center',
  },
  centerText: {
    color: '#475569',
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
  primaryButton: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: '#0f766e',
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '900',
  },
});
