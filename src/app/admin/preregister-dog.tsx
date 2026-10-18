import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { KeyboardAwareScreen } from '../../components/ui/KeyboardAwareScreen';
import { ucapsaBrand } from '../../constants/brand';
import { useSession } from '../../hooks/useSession';
import { adminPreregisterDog } from '../../services/dog-preregistration.service';

export default function AdminPreregisterDogScreen() {
  const { isAdmin } = useSession();
  const [ownerName, setOwnerName] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [ownerPhone, setOwnerPhone] = useState('');
  const [dogName, setDogName] = useState('');
  const [saving, setSaving] = useState(false);

  async function save() {
    if (saving) return;
    if (!ownerName.trim() || !dogName.trim() || (!ownerEmail.trim() && !ownerPhone.trim())) {
      Alert.alert('Faltan datos', 'Escribe el tutor, el perro y al menos correo o teléfono.');
      return;
    }
    try {
      setSaving(true);
      await adminPreregisterDog({ ownerName, ownerEmail, ownerPhone, dogName });
      Alert.alert('Perro preinscrito',
        'Cuando el dueño se registre y verifique un contacto coincidente, el expediente se vinculará automáticamente si no hay conflictos.',
        [{ text: 'Listo', onPress: () => router.back() }]);
    } catch (cause) {
      Alert.alert('No se pudo preinscribir',
        cause instanceof Error ? cause.message : 'Revisa la información e inténtalo nuevamente.');
    } finally {
      setSaving(false);
    }
  }

  if (!isAdmin) return <Redirect href="/home" />;

  return (
    <KeyboardAwareScreen style={{ backgroundColor: ucapsaBrand.colors.background }}>
      <Pressable style={styles.back} onPress={() => router.back()} accessibilityRole="button">
        <MaterialIcons name="arrow-back" size={20} color={ucapsaBrand.colors.redDark} />
        <Text style={styles.backText}>Clientes</Text>
      </Pressable>
      <Text style={styles.eyebrow}>Administración</Text>
      <Text style={styles.heading}>Preinscribir perro</Text>
      <Text style={styles.description}>
        Registra al perro sin crear una cuenta ficticia. El tutor podrá reclamar su expediente al
        verificar un correo o teléfono coincidente.
      </Text>

      <View style={styles.card}>
        <Text style={styles.label}>Nombre del tutor</Text>
        <TextInput style={styles.input} value={ownerName} onChangeText={setOwnerName}
          autoCapitalize="words" autoCorrect={false} maxLength={120}
          placeholder="Nombre del tutor" placeholderTextColor={ucapsaBrand.colors.muted} />

        <Text style={styles.label}>Correo del tutor (opcional)</Text>
        <TextInput style={styles.input} value={ownerEmail} onChangeText={setOwnerEmail}
          autoCapitalize="none" keyboardType="email-address" autoCorrect={false}
          maxLength={254} placeholder="correo@ejemplo.com"
          placeholderTextColor={ucapsaBrand.colors.muted} />

        <Text style={styles.label}>Teléfono del tutor (opcional)</Text>
        <TextInput style={styles.input} value={ownerPhone} onChangeText={setOwnerPhone}
          keyboardType="phone-pad" maxLength={16} placeholder="+525512345678"
          placeholderTextColor={ucapsaBrand.colors.muted} />
        <Text style={styles.helper}>Usa formato internacional: +52 y los 10 dígitos de México. Debes indicar correo o teléfono; ambos son preferibles.</Text>

        <Text style={styles.label}>Nombre del perro</Text>
        <TextInput style={styles.input} value={dogName} onChangeText={setDogName}
          autoCapitalize="words" maxLength={80} placeholder="Nombre del perro"
          placeholderTextColor={ucapsaBrand.colors.muted} />
      </View>

      <Pressable style={[styles.saveButton, saving && styles.disabled]} disabled={saving}
        accessibilityRole="button" onPress={() => void save()}>
        {saving ? <ActivityIndicator color={ucapsaBrand.colors.surface} /> :
          <MaterialIcons name="pets" size={20} color={ucapsaBrand.colors.surface} />}
        <Text style={styles.saveText}>{saving ? 'Guardando…' : 'Guardar preinscripción'}</Text>
      </Pressable>
      <Text style={styles.footer}>
        No activa membresías, inscripciones, pagos ni asistencias. Las coincidencias dudosas no se vinculan automáticamente.
      </Text>
    </KeyboardAwareScreen>
  );
}

const styles = StyleSheet.create({
  back: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  backText: { color: ucapsaBrand.colors.redDark, fontWeight: '800', fontSize: 13 },
  eyebrow: { fontSize: 11, fontWeight: '900', color: ucapsaBrand.colors.redDark },
  heading: { fontSize: 26, fontWeight: '900', color: ucapsaBrand.colors.text, marginTop: 4 },
  description: { marginTop: 8, marginBottom: 16, fontSize: 13, lineHeight: 19, color: ucapsaBrand.colors.muted },
  card: { borderWidth: 1, borderColor: ucapsaBrand.colors.border, borderRadius: 17, backgroundColor: ucapsaBrand.colors.surface, padding: 16, marginBottom: 16 },
  label: { fontSize: 12, fontWeight: '800', color: ucapsaBrand.colors.text, marginBottom: 7, marginTop: 9 },
  input: { minHeight: 47, borderWidth: 1, borderColor: ucapsaBrand.colors.border, borderRadius: 11, paddingHorizontal: 12, color: ucapsaBrand.colors.text, fontSize: 14 },
  helper: { fontSize: 11, color: ucapsaBrand.colors.muted, lineHeight: 17, marginTop: 7 },
  saveButton: { minHeight: 49, backgroundColor: ucapsaBrand.colors.greenDark, borderRadius: 14, justifyContent: 'center', alignItems: 'center', flexDirection: 'row', gap: 9 },
  saveText: { fontWeight: '900', color: ucapsaBrand.colors.surface, fontSize: 14 },
  footer: { color: ucapsaBrand.colors.muted, lineHeight: 17, fontSize: 11, marginTop: 12 },
  disabled: { opacity: 0.65 },
});
