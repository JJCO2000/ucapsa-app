import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ucapsaBrand } from '../../constants/brand';

/**
 * Notice at the point where personnel collect a titular's or family member's
 * contact data. This is an operational disclosure, NOT consent by third parties.
 * Always link to the single notice published in Supabase.
 */
export function PreregistrationPrivacyNotice() {
  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <MaterialIcons name="privacy-tip" size={22} color={ucapsaBrand.colors.redDark} />
        <Text style={styles.title}>Privacidad antes de registrar</Text>
      </View>
      <Text style={styles.body}>
        Explica la finalidad de la preinscripción y facilita el aviso de privacidad a la
        persona antes de capturar su contacto. Si agregas familiares, informa también a
        cada persona involucrada mediante el procedimiento de Administración. Registrar
        un contacto no demuestra su consentimiento ni autoriza a compartir cuentas,
        fotografías o progreso.
      </Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Consultar aviso de privacidad vigente"
        style={styles.link} onPress={() => router.push('/privacy' as never)}>
        <Text style={styles.linkText}>Consultar aviso vigente</Text>
        <MaterialIcons name="open-in-new" size={17} color={ucapsaBrand.colors.redDark} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 14, borderWidth: 1, borderColor: ucapsaBrand.colors.border,
    backgroundColor: ucapsaBrand.colors.surface, padding: 14, marginBottom: 16,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { flex: 1, color: ucapsaBrand.colors.text, fontSize: 14, fontWeight: '900' },
  body: { marginTop: 9, color: ucapsaBrand.colors.muted, fontSize: 12, lineHeight: 18 },
  link: { marginTop: 12, minHeight: 44, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'center', gap: 8,
    borderRadius: 11, borderWidth: 1, borderColor: ucapsaBrand.colors.border },
  linkText: { color: ucapsaBrand.colors.redDark, fontSize: 13, fontWeight: '900' },
});
