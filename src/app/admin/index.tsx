import { MaterialIcons } from '@expo/vector-icons';
import { Link, router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { UcapsaRoleCard, UcapsaRoleHero } from '../../components/layout/UcapsaRoleLayout';
import { Screen } from '../../components/ui/Screen';
import { resolveUcapsaFormat } from '../../constants/ucapsaFormats';
import { useSession } from '../../hooks/useSession';

const adminLinks = [
  { href: '/admin/announcements', title: 'Anuncios', description: 'Crear, editar, publicar, archivar y eliminar avisos.', icon: 'campaign' },
  { href: '/admin/events', title: 'Eventos', description: 'Gestionar calendario, recurrencias y agenda.', icon: 'event' },
  { href: '/admin/members', title: 'Socios', description: 'Solicitudes, credenciales, pagos manuales y estadisticas.', icon: 'badge' },
  { href: '/admin/scanner', title: 'Escaner UCAPSA', description: 'Verificar socios y registrar asistencias de Puppy o Comandos.', icon: 'qr-code-scanner' },
  { href: '/admin/classes', title: 'Clases UCAPSA', description: 'Puppy, Comandos, tarjetas fisicas y QR por perro.', icon: 'school' },
] as const;

export default function AdminHomeScreen() {
  const { loading, user, role, isAdmin } = useSession();
  const format = resolveUcapsaFormat({ user, role, isAdmin: true });

  if (loading) {
    return (
      <Screen backgroundColor={format.background}>
        <Denied icon="admin-panel-settings" title="Revisando acceso" text="Cargando sesion..." format={format} />
      </Screen>
    );
  }

  if (!user) {
    return (
      <Screen backgroundColor={format.background}>
        <Denied icon="lock" title="Acceso restringido" text="Inicia sesion con una cuenta administrativa para abrir este panel." format={format} actionLabel="Iniciar sesion" onAction={() => router.push('/auth/login' as never)} />
      </Screen>
    );
  }

  if (!isAdmin) {
    return (
      <Screen backgroundColor={format.background}>
        <Denied icon="lock" title="Acceso restringido" text="Solo administradores pueden abrir el panel administrativo." format={format} actionLabel="Volver a Inicio" onAction={() => router.push('/home' as never)} />
      </Screen>
    );
  }

  return (
    <Screen backgroundColor={format.background}>
      <UcapsaRoleHero format={format} eyebrow="UCAPSA Admin" title="Panel administrativo" subtitle="Gestiona comunicacion, calendario, socios y clases desde un solo lugar." icon="admin-panel-settings" />

      <UcapsaRoleCard format={format} title="MVP activo" subtitle="Pagos y usuarios se administran desde Socios por ahora. No se muestran modulos vacios para evitar confusion." icon="verified" />

      <View style={styles.grid}>
        {adminLinks.map((item) => (
          <Link key={item.href} href={item.href as never} asChild>
            <Pressable style={[styles.card, { backgroundColor: format.surface, borderColor: format.border }]}> 
              <View style={[styles.iconBox, { backgroundColor: format.accentSoft }]}> 
                <MaterialIcons name={item.icon} size={24} color={format.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.cardTitle, { color: format.text }]}>{item.title}</Text>
                <Text style={[styles.cardDescription, { color: format.muted }]}>{item.description}</Text>
              </View>
              <MaterialIcons name="chevron-right" size={24} color={format.accent} />
            </Pressable>
          </Link>
        ))}
      </View>
    </Screen>
  );
}

function Denied({ icon, title, text, actionLabel, onAction, format }: { icon: keyof typeof MaterialIcons.glyphMap; title: string; text: string; actionLabel?: string; onAction?: () => void; format: ReturnType<typeof resolveUcapsaFormat> }) {
  return (
    <View style={styles.deniedBox}>
      <MaterialIcons name={icon} size={42} color={format.accent} />
      <Text style={[styles.deniedTitle, { color: format.text }]}>{title}</Text>
      <Text style={[styles.deniedText, { color: format.muted }]}>{text}</Text>
      {actionLabel && onAction ? (
        <Pressable style={[styles.deniedPrimaryButton, { backgroundColor: format.primaryButton }]} onPress={onAction}>
          <Text style={[styles.deniedPrimaryText, { color: format.primaryButtonText }]}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { gap: 12 },
  deniedBox: { flex: 1, minHeight: 420, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  deniedTitle: { fontSize: 24, fontWeight: '900', textAlign: 'center' },
  deniedText: { fontSize: 14, lineHeight: 20, textAlign: 'center', fontWeight: '700' },
  deniedPrimaryButton: { marginTop: 8, alignItems: 'center', borderRadius: 16, paddingHorizontal: 18, paddingVertical: 13 },
  deniedPrimaryText: { fontSize: 14, fontWeight: '900' },
  card: { flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: 22, padding: 16, borderWidth: 1 },
  iconBox: { alignItems: 'center', justifyContent: 'center', width: 46, height: 46, borderRadius: 16 },
  cardTitle: { fontSize: 17, fontWeight: '900' },
  cardDescription: { marginTop: 3, fontSize: 13, lineHeight: 18, fontWeight: '700' },
});
