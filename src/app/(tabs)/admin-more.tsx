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
        <Text style={styles.title}>Herramientas y configuración</Text>
        <Text style={styles.subtitle}>Opciones poco frecuentes que no necesitan ocupar una pestaña principal.</Text>
      </View>

      <Text style={styles.sectionTitle}>Operación especial</Text>
      <View style={styles.card}>
        <MenuRow
          icon="restaurant-menu"
          title="Restaurante"
          subtitle="Editar menú, precios y disponibilidad"
          onPress={() => router.push('/admin/restaurant' as never)}
          last
        />
      </View>

      {isSuperAdmin ? (
        <>
          <Text style={styles.sectionTitle}>Sistema · solo superadmin</Text>
          <View style={styles.card}>
            <MenuRow
              icon="manage-accounts"
              title="Usuarios"
              subtitle="Clientes, socios y cuentas administrativas"
              onPress={() => router.push('/admin/users' as never)}
            />
            <MenuRow
              icon="tune"
              title="Configuración administrativa"
              subtitle="Controles de sistema y herramientas menos frecuentes"
              onPress={() => router.push('/admin/tools-administration' as never)}
              last
            />
          </View>
        </>
      ) : null}

      <Text style={styles.sectionTitle}>Cuenta</Text>
      <View style={styles.card}>
        <MenuRow
          icon="person"
          title="Mi perfil"
          subtitle="Datos personales y cuenta"
          onPress={() => router.push('/account-settings' as never)}
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
  kicker: { color: ucapsaBrand.colors.redDark, fontSize: 12, fontWeight: '900', textTransform: 'uppercase' },
  title: { color: ucapsaBrand.colors.text, fontSize: 30, lineHeight: 35, fontWeight: '900' },
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
    minHeight: 68,
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: ucapsaBrand.colors.premiumMuted,
  },
  rowLast: { borderBottomWidth: 0 },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ucapsaBrand.colors.redSoft,
  },
  rowTitle: { color: ucapsaBrand.colors.text, fontSize: 15, fontWeight: '900' },
  rowSubtitle: { color: ucapsaBrand.colors.muted, fontSize: 11, lineHeight: 16, fontWeight: '700', marginTop: 2 },
  pressed: { opacity: 0.78, transform: [{ scale: 0.99 }] },
});
