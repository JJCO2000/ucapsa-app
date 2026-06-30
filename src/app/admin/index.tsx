import { MaterialIcons } from '@expo/vector-icons';
import { Link } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Screen } from '../../components/ui/Screen';

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
    href: '/admin/classes',
    title: 'Clases UCAPSA',
    description: 'Puppy, Comandos, tarjetas fisicas y QR por perro.',
    icon: 'school',
  },
] as const;

export default function AdminHomeScreen() {
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
  card: { flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: 22, backgroundColor: '#ffffff', padding: 16 },
  iconBox: { alignItems: 'center', justifyContent: 'center', width: 46, height: 46, borderRadius: 16, backgroundColor: '#ccfbf1' },
  cardTitle: { color: '#0f172a', fontSize: 17, fontWeight: '900' },
  cardDescription: { marginTop: 3, color: '#64748b', fontSize: 13, lineHeight: 18, fontWeight: '700' },
});



