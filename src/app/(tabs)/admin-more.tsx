import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Redirect, router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { KeyboardAwareScreen } from '../../components/ui/KeyboardAwareScreen';
import { ucapsaBrand } from '../../constants/brand';
import { useSession } from '../../hooks/useSession';

export default function AdminMoreTab() {
  const { isAdmin } = useSession();
  if (!isAdmin) return <Redirect href="/home" />;

  return (
    <KeyboardAwareScreen>
      <View style={styles.header}>
        <Text style={styles.kicker}>Admin</Text>
        <Text style={styles.title}>Mas</Text>
        <Text style={styles.subtitle}>Solo cuatro caminos. Cada uno abre una tarea concreta.</Text>
      </View>

      <View style={styles.card}>
        <MenuRow icon="calendar-month" title="Calendario" subtitle="Agenda de eventos, anuncios y clases" onPress={() => router.push('/calendar' as never)} />
        <MenuRow icon="campaign" title="Comunicacion" subtitle="Anuncios, eventos y notificaciones" onPress={() => router.push('/admin/tools-communication' as never)} />
        <MenuRow icon="tune" title="Administracion" subtitle="Membresias, administradores y ajustes" onPress={() => router.push('/admin/tools-administration' as never)} />
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
  card: { borderRadius: 20, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: '#fff', overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 68, padding: 14, borderBottomWidth: 1, borderBottomColor: '#F4E5E8' },
  rowLast: { borderBottomWidth: 0 },
  iconBox: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: ucapsaBrand.colors.redSoft },
  rowTitle: { color: ucapsaBrand.colors.text, fontSize: 15, fontWeight: '900' },
  rowSubtitle: { color: ucapsaBrand.colors.muted, fontSize: 11, lineHeight: 16, fontWeight: '700', marginTop: 2 },
});
