import { MaterialIcons } from '@expo/vector-icons';
import { Link, router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Screen } from '../../components/ui/Screen';
import { useSession } from '../../hooks/useSession';

const adminLinks = [
  {
    href: '/admin/announcements',
    title: 'Anuncios',
    description: 'Crear, editar, publicar, archivar y eliminar avisos.',
    icon: 'campaign',
  },
  {
    href: '/admin/events',
    title: 'Eventos',
    description: 'Gestionar calendario, recurrencias y agenda.',
    icon: 'event',
  },
  {
    href: '/admin/members',
    title: 'Socios',
    description: 'Solicitudes, credenciales, pagos manuales y estadisticas.',
    icon: 'badge',
  },
  {
    href: '/admin/scanner',
    title: 'Escaner UCAPSA',
    description: 'Verificar socios y registrar asistencias de Puppy o Comandos.',
    icon: 'qr-code-scanner',
  },
  {
    href: '/admin/classes',
    title: 'Clases UCAPSA',
    description: 'Puppy, Comandos, tarjetas fisicas y QR por perro.',
    icon: 'school',
  },
] as const;

export default function AdminHomeScreen() {
  const { loading, user, isAdmin } = useSession();

  if (loading) {
    return (
      <Screen>
        <View style={styles.deniedBox}>
          <MaterialIcons name="admin-panel-settings" size={42} color="#0f766e" />
          <Text style={styles.deniedTitle}>Revisando acceso</Text>
          <Text style={styles.deniedText}>Cargando sesion...</Text>
        </View>
      </Screen>
    );
  }

  if (!user) {
    return (
      <Screen>
        <View style={styles.deniedBox}>
          <MaterialIcons name="lock" size={42} color="#991b1b" />
          <Text style={styles.deniedTitle}>Acceso restringido</Text>
          <Text style={styles.deniedText}>Inicia sesion con una cuenta administrativa para abrir este panel.</Text>
          <Pressable style={styles.deniedPrimaryButton} onPress={() => router.push('/auth/login' as never)}>
            <Text style={styles.deniedPrimaryText}>Iniciar sesion</Text>
          </Pressable>
        </View>
      </Screen>
    );
  }

  if (!isAdmin) {
    return (
      <Screen>
        <View style={styles.deniedBox}>
          <MaterialIcons name="lock" size={42} color="#991b1b" />
          <Text style={styles.deniedTitle}>Acceso restringido</Text>
          <Text style={styles.deniedText}>Solo administradores pueden abrir el panel administrativo.</Text>
          <Pressable style={styles.deniedPrimaryButton} onPress={() => router.push('/home' as never)}>
            <Text style={styles.deniedPrimaryText}>Volver a Inicio</Text>
          </Pressable>
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={styles.kicker}>UCAPSA Admin</Text>
        <Text style={styles.title}>Panel administrativo</Text>
        <Text style={styles.description}>
          Gestiona comunicacion, calendario, socios y clases desde un solo lugar.
        </Text>
      </View>

      <View style={styles.noticeCard}>
        <Text style={styles.noticeTitle}>MVP activo</Text>
        <Text style={styles.noticeText}>
          Pagos y usuarios se administran desde Socios por ahora. No se muestran modulos vacios para evitar confusion.
        </Text>
      </View>

      <View style={styles.grid}>
        {adminLinks.map((item) => (
          <Link key={item.href} href={item.href as never} asChild>
            <Pressable style={styles.card}>
              <View style={styles.iconBox}>
                <MaterialIcons name={item.icon} size={24} color="#0f766e" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>{item.title}</Text>
                <Text style={styles.cardDescription}>{item.description}</Text>
              </View>
              <MaterialIcons name="chevron-right" size={24} color="#94a3b8" />
            </Pressable>
          </Link>
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: 8, marginBottom: 14 },
  kicker: { color: '#0f766e', fontSize: 12, fontWeight: '900', textTransform: 'uppercase' },
  title: { color: '#0f172a', fontSize: 30, fontWeight: '900' },
  description: { color: '#475569', fontSize: 15, lineHeight: 22 },
  noticeCard: {
    gap: 6,
    marginBottom: 18,
    borderRadius: 18,
    backgroundColor: '#ecfdf5',
    borderWidth: 1,
    borderColor: '#99f6e4',
    padding: 14,
  },
  noticeTitle: { color: '#0f766e', fontSize: 14, fontWeight: '900' },
  noticeText: { color: '#134e4a', fontSize: 13, lineHeight: 19, fontWeight: '700' },
  grid: { gap: 12 },
  deniedBox: { flex: 1, minHeight: 420, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  deniedTitle: { color: '#0f172a', fontSize: 24, fontWeight: '900', textAlign: 'center' },
  deniedText: { color: '#475569', fontSize: 14, lineHeight: 20, textAlign: 'center', fontWeight: '700' },
  deniedPrimaryButton: { marginTop: 8, alignItems: 'center', borderRadius: 16, paddingHorizontal: 18, paddingVertical: 13, backgroundColor: '#0f766e' },
  deniedPrimaryText: { color: '#ffffff', fontSize: 14, fontWeight: '900' },
  card: { flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: 22, backgroundColor: '#ffffff', padding: 16 },
  iconBox: { alignItems: 'center', justifyContent: 'center', width: 46, height: 46, borderRadius: 16, backgroundColor: '#ccfbf1' },
  cardTitle: { color: '#0f172a', fontSize: 17, fontWeight: '900' },
  cardDescription: { marginTop: 3, color: '#64748b', fontSize: 13, lineHeight: 18, fontWeight: '700' },
});





