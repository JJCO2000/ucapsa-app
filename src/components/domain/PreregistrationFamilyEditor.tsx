import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { ucapsaBrand } from '../../constants/brand';
import { normalizeFamilyMembers, type FamilyMemberInput } from '../../services/preregistration-family.service';

type Props = {
  value: FamilyMemberInput[];
  onChange: (members: FamilyMemberInput[]) => void;
  disabled?: boolean;
};

export function PreregistrationFamilyEditor({ value, onChange, disabled = false }: Props) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [error, setError] = useState('');

  // "Otro registro" limpia el formulario del titular: olvidar cualquier tarjeta abierta.
  useEffect(() => {
    if (value.length === 0) {
      setEditingIndex(null);
      setError('');
    }
  }, [value.length]);

  function update(index: number, key: keyof FamilyMemberInput, text: string) {
    onChange(value.map((item, current) => current === index ? { ...item, [key]: text } : item));
    setError('');
  }

  function add() {
    if (disabled || value.length >= 30) return;
    if (editingIndex !== null && value[editingIndex]) {
      try { normalizeFamilyMembers([value[editingIndex]]); }
      catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Revisa los datos del integrante.');
        return;
      }
    }
    onChange([...value, { fullName: '', email: '', phone: '' }]);
    setEditingIndex(value.length);
    setError('');
  }

  function complete(index: number) {
    try {
      normalizeFamilyMembers([value[index]]);
      setEditingIndex(null);
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Revisa los datos del integrante.');
    }
  }

  function remove(index: number) {
    if (disabled) return;
    onChange(value.filter((_, current) => current !== index));
    setEditingIndex(editingIndex === index ? null
      : editingIndex !== null && editingIndex > index ? editingIndex - 1 : editingIndex);
    setError('');
  }

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Familia (opcional)</Text>
      <Text style={styles.hint}>
        El titular es la persona registrada arriba. Añade otros integrantes sin crearles una cuenta.
        Añade correo o celular para poder identificar al integrante. La vinculación se autorizará después.
      </Text>
      {value.map((member, index) => (
        <View key={index} style={styles.memberCard}>
          <View style={styles.row}>
            <Text style={styles.name}>{member.fullName.trim() || 'Nuevo integrante'}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel={'Quitar integrante ' + (index + 1)}
              disabled={disabled} onPress={() => remove(index)}>
              <MaterialIcons name="close" size={22} color={ucapsaBrand.colors.redDark} />
            </Pressable>
          </View>
          {editingIndex === index ? (
            <>
              <Text style={styles.label}>Nombre completo *</Text>
              <TextInput value={member.fullName} onChangeText={(text) => update(index, 'fullName', text)}
                style={styles.input} maxLength={120} autoCapitalize="words" editable={!disabled}
                accessibilityLabel={'Nombre del integrante ' + (index + 1)}
                placeholder="Nombre y apellidos" placeholderTextColor={ucapsaBrand.colors.muted} />
              <Text style={styles.label}>Celular (correo o celular obligatorio)</Text>
              <TextInput value={member.phone} onChangeText={(text) => update(index, 'phone', text)}
                style={styles.input} maxLength={20} keyboardType="phone-pad" editable={!disabled}
                accessibilityLabel={'Celular del integrante ' + (index + 1)}
                placeholder="Número de contacto" placeholderTextColor={ucapsaBrand.colors.muted} />
              <Text style={styles.label}>Correo (correo o celular obligatorio)</Text>
              <TextInput value={member.email} onChangeText={(text) => update(index, 'email', text)}
                style={styles.input} maxLength={254} keyboardType="email-address"
                autoCapitalize="none" autoCorrect={false} editable={!disabled}
                accessibilityLabel={'Correo del integrante ' + (index + 1)}
                placeholder="correo@ejemplo.com" placeholderTextColor={ucapsaBrand.colors.muted} />
              <Pressable accessibilityRole="button" disabled={disabled}
                style={styles.smallButton} onPress={() => complete(index)}>
                <Text style={styles.smallButtonText}>Guardar integrante</Text>
              </Pressable>
            </>
          ) : (
            <Pressable accessibilityRole="button" disabled={disabled}
              accessibilityLabel={'Editar integrante ' + member.fullName}
              onPress={() => { setEditingIndex(index); setError(''); }}>
              <Text style={styles.detail}>
                {[member.phone.trim(), member.email.trim()].filter(Boolean).join(' · ')
                  || 'Sin contacto adicional'} · Editar
              </Text>
            </Pressable>
          )}
        </View>
      ))}
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      <Pressable accessibilityRole="button" disabled={disabled || value.length >= 30}
        onPress={add} style={styles.addRow}>
        <MaterialIcons name="person-add" size={20} color={ucapsaBrand.colors.redDark} />
        <Text style={styles.addText}>Añadir integrante</Text>
      </Pressable>
      <Text style={styles.hint}>
        Los integrantes quedan en el expediente familiar. No pueden reclamar otros perfiles,
        ver fotografías ajenas ni utilizar beneficios por aparecer aquí.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderColor: ucapsaBrand.colors.border, borderRadius: 17,
    backgroundColor: ucapsaBrand.colors.surface, padding: 16, marginBottom: 16 },
  title: { color: ucapsaBrand.colors.text, fontSize: 16, fontWeight: '900' },
  hint: { color: ucapsaBrand.colors.muted, fontSize: 12, lineHeight: 18, marginTop: 8 },
  memberCard: { borderWidth: 1, borderColor: ucapsaBrand.colors.border, borderRadius: 12,
    padding: 12, marginTop: 12 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  name: { color: ucapsaBrand.colors.text, fontSize: 14, fontWeight: '800', flex: 1 },
  label: { color: ucapsaBrand.colors.text, fontSize: 12, fontWeight: '700', marginTop: 12, marginBottom: 6 },
  input: { borderWidth: 1, borderColor: ucapsaBrand.colors.border, borderRadius: 10,
    color: ucapsaBrand.colors.text, minHeight: 45, paddingHorizontal: 12, fontSize: 14 },
  detail: { marginTop: 8, color: ucapsaBrand.colors.redDark, fontSize: 12, fontWeight: '700' },
  smallButton: { marginTop: 14, backgroundColor: ucapsaBrand.colors.greenDark,
    borderRadius: 12, padding: 12, alignItems: 'center' },
  smallButtonText: { color: ucapsaBrand.colors.surface, fontWeight: '900', fontSize: 13 },
  addRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    minHeight: 48, borderRadius: 12, borderWidth: 1, borderColor: ucapsaBrand.colors.border, marginTop: 12 },
  addText: { color: ucapsaBrand.colors.redDark, fontWeight: '900', fontSize: 13 },
  error: { color: ucapsaBrand.colors.danger, fontWeight: '700', fontSize: 12, marginTop: 10 },
});
