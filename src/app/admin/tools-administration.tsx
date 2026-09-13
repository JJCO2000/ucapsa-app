import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Redirect, router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { KeyboardAwareScreen } from '../../components/ui/KeyboardAwareScreen';
import { ucapsaBrand } from '../../constants/brand';
import { useSession } from '../../hooks/useSession';

export default function AdministrationToolsScreen() {
  const { isAdmin, role } = useSession();
  if (!isAdmin) return <Redirect href="/home" />;

  const isSuperAdmin = role === 'super_admin';

  return (
    <KeyboardAwareScreen>
      <View style={styles.header}>
        <Text style={styles.kicker}>{isSuperAdmin ? 'Superadmin' : 'Admin'}</Text>
        <Text style={styles.title}>Administración</Text>
        <Text style={styles.subtitle}>Configuración menos frecuente, separada de la operación diaria.</Text>
      </View>
      <View style={styles.card}>
        <Row icon="badge" title="Membresías" subtitle="Buscar socios y gestionar su vigencia" onPress={() => router.push('/admin/members' as never)} />
        {isSuperAdmin ? <Row icon="admin-panel-settings" title="Administradores" subtitle="Cuentas, roles y permisos administrativos" onPress={() => router.push('/admin/users?filter=admins' as never)} /> : null}
        <Row icon="settings" title="Ajustes" subtitle="Preferencias y configuración de cuenta" onPress={() => router.push('/account-settings' as never)} last />
      </View>

      {!isSuperAdmin ? (
        <View style={styles.note}>
          <MaterialIcons name="lock-outline" size={19} color={ucapsaBrand.colors.muted} />
          <Text style={styles.noteText}>La administración de cuentas administrativas está reservada para Superadmin.</Text>
        </View>
      ) : null}
    </KeyboardAwareScreen>
  );
}

function Row({ icon, title, subtitle, onPress, last = false }: { icon: keyof typeof MaterialIcons.glyphMap; title: string; subtitle: string; onPress: () => void; last?: boolean }) {
  return <Pressable style={[styles.row, last && styles.rowLast]} onPress={onPress}><View style={styles.iconBox}><MaterialIcons name={icon} size={22} color={ucapsaBrand.colors.redDark} /></View><View style={{ flex: 1 }}><Text style={styles.rowTitle}>{title}</Text><Text style={styles.rowSubtitle}>{subtitle}</Text></View><MaterialIcons name="chevron-right" size={24} color={ucapsaBrand.colors.redDark} /></Pressable>;
}

const styles = StyleSheet.create({
  header: { marginBottom: 18 },
  kicker: { color: ucapsaBrand.colors.redDark, fontSize: 12, fontWeight: '900', textTransform: 'uppercase' },
  title: { color: ucapsaBrand.colors.text, fontSize: 28, fontWeight: '900' },
  subtitle: { color: ucapsaBrand.colors.muted, fontSize: 13, lineHeight: 19, marginTop: 3, fontWeight: '700' },
  card: { borderRadius: 20, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, minHeight: 66, borderBottomWidth: 1, borderBottomColor: ucapsaBrand.colors.premiumMuted },
  rowLast: { borderBottomWidth: 0 },
  iconBox: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: ucapsaBrand.colors.redSoft },
  rowTitle: { color: ucapsaBrand.colors.text, fontSize: 15, fontWeight: '900' },
  rowSubtitle: { color: ucapsaBrand.colors.muted, fontSize: 11, lineHeight: 16, marginTop: 2, fontWeight: '700' },
  note: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderRadius: 16, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surfaceAlt, padding: 12, marginTop: 12 },
  noteText: { flex: 1, color: ucapsaBrand.colors.muted, fontSize: 11, lineHeight: 17, fontWeight: '700' },
});
