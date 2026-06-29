import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSession } from '../../hooks/useSession';

export default function AdminHomeScreen() {
  const { isAdmin, role } = useSession();

  if (!isAdmin) {
    return (
      <View style={styles.deniedContainer}>
        <MaterialIcons name="lock" size={42} color="#991b1b" />
        <Text style={styles.deniedTitle}>Acceso restringido</Text>
        <Text style={styles.deniedText}>Esta zona es solo para administradores UCAPSA.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        <Text style={styles.kicker}>Panel administrativo</Text>
        <Text style={styles.title}>Gestion UCAPSA</Text>
        <Text style={styles.subtitle}>Rol activo: {role}</Text>
      </View>

      <Pressable style={styles.adminCard} onPress={() => router.push('/admin/announcements' as never)}>
        <View style={styles.iconBox}>
          <MaterialIcons name="campaign" size={24} color="#0f766e" />
        </View>
        <View style={styles.cardText}>
          <Text style={styles.cardTitle}>Anuncios</Text>
          <Text style={styles.cardDescription}>Crear, editar, publicar, archivar y eliminar comunicados.</Text>
        </View>
        <MaterialIcons name="chevron-right" size={26} color="#64748b" />
      </Pressable>

      <Pressable style={styles.adminCard} onPress={() => router.push('/admin/events' as never)}>
        <View style={styles.iconBox}>
          <MaterialIcons name="event" size={24} color="#0f766e" />
        </View>
        <View style={styles.cardText}>
          <Text style={styles.cardTitle}>Eventos</Text>
          <Text style={styles.cardDescription}>Administrar calendario y vincular eventos con anuncios.</Text>
        </View>
        <MaterialIcons name="chevron-right" size={26} color="#64748b" />
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  content: {
    gap: 14,
    padding: 20,
    paddingBottom: 80,
  },
  hero: {
    gap: 8,
    padding: 22,
    borderRadius: 26,
    backgroundColor: '#0f172a',
  },
  kicker: {
    color: '#5eead4',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  title: {
    color: '#ffffff',
    fontSize: 28,
    fontWeight: '900',
  },
  subtitle: {
    color: '#cbd5e1',
    fontSize: 14,
    fontWeight: '700',
  },
  adminCard: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
    padding: 16,
    borderRadius: 20,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  iconBox: {
    width: 48,
    height: 48,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ccfbf1',
  },
  cardText: {
    flex: 1,
    gap: 3,
  },
  cardTitle: {
    color: '#0f172a',
    fontSize: 17,
    fontWeight: '900',
  },
  cardDescription: {
    color: '#64748b',
    fontSize: 13,
    lineHeight: 18,
  },
  deniedContainer: {
    flex: 1,
    gap: 10,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#f8fafc',
  },
  deniedTitle: {
    color: '#991b1b',
    fontSize: 22,
    fontWeight: '900',
  },
  deniedText: {
    color: '#64748b',
    textAlign: 'center',
  },
});
