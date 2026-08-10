import { MaterialIcons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { KeyboardAwareScreen } from '../../components/ui/KeyboardAwareScreen';
import { ucapsaBrand } from '../../constants/brand';
import { useSession } from '../../hooks/useSession';
import { getProfileByUserId, updateAdminCustomerProfile } from '../../services/profiles.service';
import type { Profile } from '../../types/app.types';

export default function CustomerProfileEditScreen() {
  const { isAdmin } = useSession();
  const params = useLocalSearchParams<{ userId?: string }>();
  const userId = typeof params.userId === 'string' ? params.userId.trim() : '';
  const [profile, setProfile] = useState<Profile | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!isAdmin || !userId) return;
    const row = await getProfileByUserId(userId);
    setProfile(row);
    setName(row?.full_name ?? '');
    setEmail(row?.email ?? '');
    setPhone(row?.phone ?? '');
  }, [isAdmin, userId]);

  useFocusEffect(useCallback(() => {
    setLoading(true);
    void load().finally(() => setLoading(false));
    return undefined;
  }, [load]));

  async function save() {
    if (!profile) return;
    try {
      setSaving(true);
      await updateAdminCustomerProfile(userId, {
        full_name: name,
        email,
        phone,
      });
      Alert.alert('Datos guardados', 'La informacion del cliente se actualizo.');
      router.back();
    } catch (cause) {
      Alert.alert('No se pudo guardar', cause instanceof Error ? cause.message : 'Intenta de nuevo.');
    } finally {
      setSaving(false);
    }
  }

  if (!isAdmin) return <KeyboardAwareScreen><Text style={styles.title}>Acceso restringido</Text></KeyboardAwareScreen>;

  return (
    <KeyboardAwareScreen>
      <View style={styles.header}>
        <Text style={styles.kicker}>Cliente</Text>
        <Text style={styles.title}>Editar datos</Text>
        <Text style={styles.subtitle}>Solo informacion de contacto. Perros, membresia, clases y pagos se administran por separado.</Text>
      </View>

      {loading ? <View style={styles.loading}><ActivityIndicator color={ucapsaBrand.colors.red} /><Text style={styles.muted}>Cargando...</Text></View> : null}

      {!loading && !profile ? (
        <View style={styles.empty}>
          <MaterialIcons name="person-off" size={32} color={ucapsaBrand.colors.redDark} />
          <Text style={styles.emptyTitle}>Cliente no disponible</Text>
        </View>
      ) : null}

      {profile ? (
        <View style={styles.card}>
          <Field label="Nombre" value={name} onChangeText={setName} placeholder="Nombre completo" />
          <Field label="Correo" value={email} onChangeText={setEmail} placeholder="correo@ejemplo.com" keyboardType="email-address" />
          <Field label="Telefono" value={phone} onChangeText={setPhone} placeholder="Telefono" keyboardType="phone-pad" />
        </View>
      ) : null}

      {profile ? (
        <View style={styles.actions}>
          <Pressable disabled={saving} style={styles.primary} onPress={save}><Text style={styles.primaryText}>{saving ? 'Guardando...' : 'Guardar'}</Text></Pressable>
          <Pressable disabled={saving} style={styles.secondary} onPress={() => router.back()}><Text style={styles.secondaryText}>Cancelar</Text></Pressable>
        </View>
      ) : null}
    </KeyboardAwareScreen>
  );
}

function Field({ label, value, onChangeText, placeholder, keyboardType }: { label: string; value: string; onChangeText: (value: string) => void; placeholder: string; keyboardType?: 'default' | 'email-address' | 'phone-pad' }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} style={styles.input} keyboardType={keyboardType} autoCapitalize={keyboardType === 'email-address' ? 'none' : 'sentences'} />
    </View>
  );
}

const styles = StyleSheet.create({
  header: { marginBottom: 16 },
  kicker: { color: ucapsaBrand.colors.redDark, fontSize: 12, fontWeight: '900', textTransform: 'uppercase' },
  title: { color: ucapsaBrand.colors.text, fontSize: 28, fontWeight: '900' },
  subtitle: { color: ucapsaBrand.colors.muted, fontSize: 13, lineHeight: 19, marginTop: 4, fontWeight: '700' },
  loading: { flexDirection: 'row', gap: 10, alignItems: 'center', paddingVertical: 12 },
  muted: { color: ucapsaBrand.colors.muted, fontSize: 13, fontWeight: '700' },
  empty: { alignItems: 'center', gap: 8, paddingVertical: 36 },
  emptyTitle: { color: ucapsaBrand.colors.text, fontSize: 18, fontWeight: '900' },
  card: { borderRadius: 20, backgroundColor: '#fff', borderWidth: 1, borderColor: ucapsaBrand.colors.border, padding: 14, gap: 12 },
  field: { gap: 6 },
  label: { color: ucapsaBrand.colors.text, fontSize: 12, fontWeight: '900' },
  input: { borderWidth: 1, borderColor: ucapsaBrand.colors.border, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 11, color: ucapsaBrand.colors.text, backgroundColor: '#FFFDFD' },
  actions: { marginTop: 14, gap: 9 },
  primary: { borderRadius: 15, backgroundColor: ucapsaBrand.colors.red, alignItems: 'center', paddingVertical: 13 },
  primaryText: { color: '#fff', fontWeight: '900', fontSize: 14 },
  secondary: { borderRadius: 15, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: '#fff', alignItems: 'center', paddingVertical: 13 },
  secondaryText: { color: ucapsaBrand.colors.redDark, fontWeight: '900', fontSize: 14 },
});
