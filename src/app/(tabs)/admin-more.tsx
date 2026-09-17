import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Redirect, router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { KeyboardAwareScreen } from '../../components/ui/KeyboardAwareScreen';
import { ucapsaBrand } from '../../constants/brand';
import { useSession } from '../../hooks/useSession';

export default function AdminMoreTab() {
  const { isAdmin, role } = useSession();
  if (!isAdmin) return <Redirect href="/home" />;

  const isSuperAdmin = role === 'super_admin';

  return (
    <KeyboardAwareScreen>
      <View style={styles.header}>
        <Text style={styles.kicker}>{isSuperAdmin ? 'Superadmin' : 'Admin'}</Text>
        <Text style={styles.title}>Más herramientas</Text>
        <Text style={styles.subtitle}>Accesos directos. Nada importante queda escondido dentro de otro menú.</Text>
      </View>

      <Text style={styles.sectionTitle}>Comunicación</Text>
      <View style={styles.card}>
        <MenuRow icon="campaign" title="Anuncios" subtitle="Crear, publicar, archivar y programar recordatorios" onPress={() => router.push('/admin/announcements' as never)} />
        <MenuRow icon="event" title="Eventos" subtitle="Agenda, fechas y recurrencias" onPress={() => router.push('/admin/events' as never)} />
        <MenuRow icon="notifications-none" title="Notificaciones" subtitle="Enviar avisos directos a usuarios" onPress={() => router.push('/admin/notifications' as never)} last />
      </View>

      <Text style={styles.sectionTitle}>Operación</Text>
      <View style={styles.card}>
        <MenuRow icon="emoji-events" title="Competencia UCAPSA" subtitle="Temporadas, constancia, exámenes, ajustes y premios" onPress={() => router.push('/admin/competition' as never)} />
        <MenuRow icon="restaurant-menu" title="Restaurante" subtitle="Editar menú, precios y disponibilidad" onPress={() => router.push('/admin/restaurant' as never)} />
        <MenuRow icon="rate-review" title="Reseñas Google" subtitle="Abrir el asistente para redactar una reseña real" onPress={() => router.push('/reviews' as never)} />
        <MenuRow icon="groups" title="Visitas de socios" subtitle="QR, registros y tendencia mensual" onPress={() => router.push('/admin/member-visits' as never)} />
        <MenuRow icon="qr-code" title="QR oficiales" subtitle="Puppy, Comandos y Socios" onPress={() => router.push('/admin/attendance-qr' as never)} />
        <MenuRow icon="calendar-month" title="Calendario" subtitle="Agenda de eventos, anuncios y clases" onPress={() => router.push('/calendar' as never)} />
        <MenuRow icon="badge" title="Membresías" subtitle="Socios, vigencias y solicitudes" onPress={() => router.push('/admin/members' as never)} last />
      </View>

      {isSuperAdmin ? (
        <>
          <Text style={styles.sectionTitle}>Sistema · solo superadmin</Text>
          <View style={styles.card}>
            <MenuRow icon="manage-accounts" title="Usuarios y permisos" subtitle="Administradores, roles y accesos" onPress={() => router.push('/admin/users' as never)} />
            <MenuRow icon="tune" title="Configuración administrativa" subtitle="Herramientas de control menos frecuentes" onPress={() => router.push('/admin/tools-administration' as never)} last />
          </View>
        </>
      ) : null}

      <Text style={styles.sectionTitle}>Cuenta</Text>
      <View style={styles.card}>
        <MenuRow icon="person" title="Mi perfil" subtitle="Datos personales y cuenta" onPress={() => router.push('/account-settings' as never)} last />
      </View>
    </KeyboardAwareScreen>
  );
}

function MenuRow({ icon, title, subtitle, onPress, last = false }: { icon: keyof typeof MaterialIcons.glyphMap; title: string; subtitle: string; onPress: () => void; last?: boolean }) {
  return (
    <Pressable style={[styles.row, last && styles.rowLast]} onPress={onPress}>
      <View style={styles.iconBox}><MaterialIcons name={icon} size={22} color={ucapsaBrand.colors.redDark} /></View>
      <View style={{ flex: 1 }}><Text style={styles.rowTitle}>{title}</Text><Text style={styles.rowSubtitle}>{subtitle}</Text></View>
      <MaterialIcons name="chevron-right" size={24} color={ucapsaBrand.colors.redDark} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: { marginBottom: 18 },
  kicker: { color: ucapsaBrand.colors.redDark, fontSize: 12, fontWeight: '900', textTransform: 'uppercase' },
  title: { color: ucapsaBrand.colors.text, fontSize: 30, fontWeight: '900' },
  subtitle: { color: ucapsaBrand.colors.muted, fontSize: 13, lineHeight: 19, fontWeight: '700', marginTop: 3 },
  sectionTitle: { color: ucapsaBrand.colors.text, fontSize: 18, fontWeight: '900', marginTop: 10, marginBottom: 9 },
  card: { borderRadius: 20, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, overflow: 'hidden', marginBottom: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 68, padding: 14, borderBottomWidth: 1, borderBottomColor: ucapsaBrand.colors.premiumMuted },
  rowLast: { borderBottomWidth: 0 },
  iconBox: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: ucapsaBrand.colors.redSoft },
  rowTitle: { color: ucapsaBrand.colors.text, fontSize: 15, fontWeight: '900' },
  rowSubtitle: { color: ucapsaBrand.colors.muted, fontSize: 11, lineHeight: 16, fontWeight: '700', marginTop: 2 },
});
