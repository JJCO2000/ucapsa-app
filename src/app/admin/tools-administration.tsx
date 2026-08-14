import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { KeyboardAwareScreen } from '../../components/ui/KeyboardAwareScreen';
import { ucapsaBrand } from '../../constants/brand';

export default function AdministrationToolsScreen() {
  return (
    <KeyboardAwareScreen>
      <View style={styles.header}><Text style={styles.kicker}>Mas</Text><Text style={styles.title}>Administracion</Text><Text style={styles.subtitle}>Herramientas menos frecuentes, separadas de la operacion diaria.</Text></View>
      <View style={styles.card}>
        <Row icon="badge" title="Membresias" subtitle="Buscar socios y gestionar su vigencia" onPress={() => router.push('/admin/members' as never)} />
        <Row icon="admin-panel-settings" title="Administradores" subtitle="Cuentas y permisos administrativos" onPress={() => router.push('/admin/users?filter=admins' as never)} />
        <Row icon="settings" title="Ajustes" subtitle="Preferencias y configuracion de cuenta" onPress={() => router.push('/account-settings' as never)} last />
      </View>
    </KeyboardAwareScreen>
  );
}

function Row({ icon, title, subtitle, onPress, last = false }: { icon: keyof typeof MaterialIcons.glyphMap; title: string; subtitle: string; onPress: () => void; last?: boolean }) {
  return <Pressable style={[styles.row, last && styles.rowLast]} onPress={onPress}><View style={styles.iconBox}><MaterialIcons name={icon} size={22} color={ucapsaBrand.colors.redDark} /></View><View style={{ flex: 1 }}><Text style={styles.rowTitle}>{title}</Text><Text style={styles.rowSubtitle}>{subtitle}</Text></View><MaterialIcons name="chevron-right" size={24} color={ucapsaBrand.colors.redDark} /></Pressable>;
}

const styles = StyleSheet.create({
  header: { marginBottom: 18 }, kicker: { color: ucapsaBrand.colors.redDark, fontSize: 12, fontWeight: '900', textTransform: 'uppercase' }, title: { color: ucapsaBrand.colors.text, fontSize: 28, fontWeight: '900' }, subtitle: { color: ucapsaBrand.colors.muted, fontSize: 13, lineHeight: 19, marginTop: 3, fontWeight: '700' },
  card: { borderRadius: 20, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: '#fff', overflow: 'hidden' }, row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, minHeight: 66, borderBottomWidth: 1, borderBottomColor: '#F4E5E8' }, rowLast: { borderBottomWidth: 0 }, iconBox: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: ucapsaBrand.colors.redSoft }, rowTitle: { color: ucapsaBrand.colors.text, fontSize: 15, fontWeight: '900' }, rowSubtitle: { color: ucapsaBrand.colors.muted, fontSize: 11, lineHeight: 16, marginTop: 2, fontWeight: '700' },
});
