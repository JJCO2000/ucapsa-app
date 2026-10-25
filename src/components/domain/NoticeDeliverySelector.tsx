import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ucapsaBrand } from '../../constants/brand';

export type NoticeDeliveryMethod = 'presencial' | 'correo_entregado' | 'otro_documentado';

const choices: { value: NoticeDeliveryMethod; title: string }[] = [
  { value: 'presencial', title: 'Entregué o mostré el aviso en persona' },
  { value: 'correo_entregado', title: 'Envié el aviso al correo de esta persona' },
  { value: 'otro_documentado', title: 'Lo entregué por otro medio documentado' },
];

/** Staff declaration only, never a recipient consent or a verified identity. */
export function NoticeDeliverySelector({
  value, onChange, disabled = false, label = 'Entrega del aviso de privacidad',
}: {
  value: NoticeDeliveryMethod | null | undefined;
  onChange: (next: NoticeDeliveryMethod) => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <View style={styles.container}>
      <Text style={styles.heading}>{label} *</Text>
      <Text style={styles.hint}>
        Marca sólo cómo se entregó realmente el aviso 1.4 a esta persona.
        No confirma su consentimiento ni verifica su identidad.
      </Text>
      {choices.map(({ value: option, title }) => (
        <Pressable key={option} accessibilityRole="radio"
          accessibilityState={{ checked: value === option, disabled }}
          disabled={disabled} style={styles.row} onPress={() => onChange(option)}>
          <MaterialIcons name={value === option ? 'radio-button-checked' : 'radio-button-unchecked'}
            size={20} color={ucapsaBrand.colors.redDark} />
          <Text style={styles.text}>{title}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginTop: 10, marginBottom: 14 },
  heading: { color: ucapsaBrand.colors.text, fontSize: 13, fontWeight: '800', marginBottom: 3 },
  hint: { color: ucapsaBrand.colors.muted, fontSize: 12, lineHeight: 17, marginBottom: 5 },
  row: { minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 7 },
  text: { flex: 1, fontSize: 12, color: ucapsaBrand.colors.text },
});
