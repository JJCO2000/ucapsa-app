import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Redirect, router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { KeyboardAwareScreen } from '../../components/ui/KeyboardAwareScreen';
import { ucapsaBrand } from '../../constants/brand';
import { useSession } from '../../hooks/useSession';

export default function AdminCommunicationTab() {
  const { isAdmin } = useSession();
  if (!isAdmin) return <Redirect href="/home" />;

  return (
    <KeyboardAwareScreen>
      <View style={styles.header}>
        <Text style={styles.kicker}>Admin</Text>
        <Text style={styles.title}>Comunicación</Text>
        <Text style={styles.subtitle}>Avisos, calendario, eventos y notificaciones viven en un solo lugar.</Text>
      </View>

      <Text style={styles.sectionTitle}>Publicar</Text>
      <View style={styles.card}>
        <MenuRow
          icon="campaign"
          title="Avisos"
          subtitle="Crear, publicar, archivar y programar recordatorios"
          onPress={() => router.push('/admin/announcements' as never)}
        />
        <MenuRow
          icon="notifications-active"
          title="Notificaciones"
          subtitle="Enviar avisos directos a clientes y socios"
          onPress={() => router.push('/admin/notifications' as never)}
          last
        />
      </View>

      <Text style={styles.sectionTitle}>Agenda</Text>
      <View style={styles.card}>
        <MenuRow
          icon="calendar-month"
          title="Calendario"
          subtitle="Vista unificada de clases, eventos, anuncios y actividad"
          onPress={() => router.push('/calendar' as never)}
        />
        <MenuRow
          icon="event"
          title="Eventos"
          subtitle="Crear fechas, recurrencias y administrar cancelaciones"
          onPress={() => router.push('/admin/events' as never)}
          last
        />
      </View>

      <Text style={styles.sectionTitle}>Relación con clientes</Text>
      <View style={styles.card}>
        <MenuRow
          icon="rate-review"
          title="Reseñas Google"
          subtitle="Abrir el asistente para redactar una reseña real"
          onPress={() => router.push('/reviews' as never)}
          last
        />
      </View>
    </KeyboardAwareScreen>
  );
}

function MenuRow({
  icon,
  title,
  subtitle,
  onPress,
  last = false,
}: {
  icon: keyof typeof MaterialIcons.glyphMap;
  title: string;
  subtitle: string;
  onPress: () => void;
  last?: boolean;
}) {
  return (
    <Pressable style={({ pressed }) => [styles.row, last && styles.rowLast, pressed && styles.pressed]} onPress={onPress}>
      <View style={styles.iconBox}>
        <MaterialIcons name={icon} size={22} color={ucapsaBrand.colors.redDark} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle}>{title}</Text>
        <Text style={styles.rowSubtitle}>{subtitle}</Text>
      </View>
      <MaterialIcons name="chevron-right" size={24} color={ucapsaBrand.colors.redDark} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: { marginBottom: 18 },
  kicker: {
    color: ucapsaBrand.colors.redDark,
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  title: { color: ucapsaBrand.colors.text, fontSize: 30, fontWeight: '900' },
  subtitle: { color: ucapsaBrand.colors.muted, fontSize: 13, lineHeight: 19, fontWeight: '700', marginTop: 3 },
  sectionTitle: { color: ucapsaBrand.colors.text, fontSize: 18, fontWeight: '900', marginTop: 10, marginBottom: 9 },
  card: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: ucapsaBrand.colors.border,
    backgroundColor: ucapsaBrand.colors.surface,
    overflow: 'hidden',
    marginBottom: 14,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 72,
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: ucapsaBrand.colors.premiumMuted,
  },
  rowLast: { borderBottomWidth: 0 },
  iconBox: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ucapsaBrand.colors.redSoft,
  },
  rowTitle: { color: ucapsaBrand.colors.text, fontSize: 15, fontWeight: '900' },
  rowSubtitle: { color: ucapsaBrand.colors.muted, fontSize: 11, lineHeight: 16, fontWeight: '700', marginTop: 2 },
  pressed: { opacity: 0.78, transform: [{ scale: 0.99 }] },
});
