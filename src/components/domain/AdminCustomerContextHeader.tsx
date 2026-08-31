import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ucapsaBrand } from '../../constants/brand';

export function adminCustomerDisplayName(profile: { full_name?: string | null; email?: string | null } | null | undefined) {
  return profile?.full_name?.trim() || profile?.email?.trim() || 'Cliente UCAPSA';
}

type Props = {
  customerName: string;
  section: string;
  subtitle?: string | null;
  onBack?: () => void;
  member?: boolean;
};

/**
 * Contexto obligatorio para cualquier pantalla administrativa que modifica a una persona.
 * El nombre siempre llega desde el perfil real que corresponde al user_id consultado.
 */
export function AdminCustomerContextHeader({ customerName, section, subtitle, onBack, member = false }: Props) {
  return (
    <View style={styles.header}>
      {onBack ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Volver" style={styles.backButton} onPress={onBack}>
          <MaterialIcons name="arrow-back" size={21} color={ucapsaBrand.colors.redDark} />
        </Pressable>
      ) : null}
      <View style={styles.copy}>
        <Text style={styles.kicker}>{member ? 'Socio' : 'Cliente'} - {section}</Text>
        <Text style={styles.title} numberOfLines={2}>{customerName}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 16 },
  copy: { flex: 1 },
  backButton: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: ucapsaBrand.colors.redSoft },
  kicker: { color: ucapsaBrand.colors.redDark, fontSize: 12, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.5 },
  title: { color: ucapsaBrand.colors.text, fontSize: 27, lineHeight: 32, fontWeight: '900', marginTop: 2 },
  subtitle: { color: ucapsaBrand.colors.muted, fontSize: 13, lineHeight: 19, fontWeight: '700', marginTop: 4 },
});
