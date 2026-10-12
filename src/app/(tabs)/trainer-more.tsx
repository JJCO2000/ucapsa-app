import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Redirect, router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { KeyboardAwareScreen } from '../../components/ui/KeyboardAwareScreen';
import { ucapsaBrand } from '../../constants/brand';
import { useSession } from '../../hooks/useSession';

export default function TrainerMoreTab() {
  const { isAdmin, capabilities } = useSession();
  if (!capabilities.canUseTrainingWorkspace) return <Redirect href={isAdmin ? '/admin-home' : '/home'} />;

  return (
    <KeyboardAwareScreen>
      <View style={styles.header}>
        <Text style={styles.kicker}>Entrenador</Text>
        <Text style={styles.title}>Más</Text>
        <Text style={styles.subtitle}>Herramientas operativas. Pagos, estadísticas generales, comunicación y configuración administrativa no están disponibles aquí.</Text>
      </View>

      <View style={styles.card}>
        <MenuRow
          icon="table-view"
          tone="green"
          title="Reporte de clases"
          subtitle="Excel mensual o por rango de fechas"
          onPress={() => router.push('/staff/training-report' as never)}
        />
        <MenuRow
          icon="person"
          tone="blue"
          title="Mi cuenta"
          subtitle="Datos personales y sesión"
          onPress={() => router.push('/account-settings' as never)}
          last
        />
      </View>
    </KeyboardAwareScreen>
  );
}

function MenuRow({
  icon,
  tone,
  title,
  subtitle,
  onPress,
  last = false,
}: {
  icon: keyof typeof MaterialIcons.glyphMap;
  tone: 'blue' | 'green';
  title: string;
  subtitle: string;
  onPress: () => void;
  last?: boolean;
}) {
  const palette = tone === 'green'
    ? { bg: ucapsaBrand.colors.greenSoft, fg: ucapsaBrand.colors.greenDark }
    : { bg: ucapsaBrand.colors.blueSoft, fg: ucapsaBrand.colors.blueDark };

  return (
    <Pressable style={({ pressed }) => [styles.row, last && styles.rowLast, pressed && styles.pressed]} onPress={onPress}>
      <View style={[styles.iconBox, { backgroundColor: palette.bg }]}>
        <MaterialIcons name={icon} size={21} color={palette.fg} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle}>{title}</Text>
        <Text style={styles.rowSubtitle}>{subtitle}</Text>
      </View>
      <MaterialIcons name="chevron-right" size={23} color={ucapsaBrand.colors.redDark} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: { marginBottom: 16 },
  kicker: { color: ucapsaBrand.colors.redDark, fontSize: 10, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.7 },
  title: { color: ucapsaBrand.colors.text, fontSize: 28, fontWeight: '900' },
  subtitle: { color: ucapsaBrand.colors.muted, fontSize: 11, lineHeight: 17, fontWeight: '700', marginTop: 3 },
  card: { borderRadius: 20, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, overflow: 'hidden' },
  row: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: 11, padding: 13, borderBottomWidth: 1, borderBottomColor: ucapsaBrand.colors.borderNeutral },
  rowLast: { borderBottomWidth: 0 },
  iconBox: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { color: ucapsaBrand.colors.text, fontSize: 14, fontWeight: '900' },
  rowSubtitle: { color: ucapsaBrand.colors.muted, fontSize: 10, lineHeight: 15, fontWeight: '700', marginTop: 2 },
  pressed: { opacity: 0.78 },
});
