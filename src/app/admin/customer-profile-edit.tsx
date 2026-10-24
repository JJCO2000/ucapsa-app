import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { AdminCustomerContextHeader, adminCustomerDisplayName } from '../../components/domain/AdminCustomerContextHeader';
import { KeyboardAwareScreen } from '../../components/ui/KeyboardAwareScreen';
import { ucapsaBrand } from '../../constants/brand';
import { getProfileByUserId, updateAdminCustomerProfile } from '../../services/profiles.service';
import type { Profile } from '../../types/app.types';

export default function CustomerProfileEditScreen() {
  const params = useLocalSearchParams<{ userId?: string }>();
  const userId = typeof params.userId === 'string' ? params.userId.trim() : '';
  const [storedProfile, setStoredProfile] = useState<Profile | null>(null);
  const [loadedForUserId, setLoadedForUserId] = useState<string | null>(null);
  const activeUserIdRef = useRef(userId);
  activeUserIdRef.current = userId;
  const loadRunRef = useRef(0);
  const saveRunRef = useRef(0);
  // The editor must not display or write a former customer's data.
  const profile = loadedForUserId === userId ? storedProfile : null;
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!userId) return;
    const runId = ++loadRunRef.current;
    const isCurrentRun = () => loadRunRef.current === runId
      && activeUserIdRef.current === userId;
    try {
      setError('');
      const row = await getProfileByUserId(userId);
      if (!isCurrentRun()) return;
      if (!row || row.user_id !== userId) {
        throw new Error('No se pudo verificar el perfil de este cliente.');
      }
      setStoredProfile(row);
      setLoadedForUserId(userId);
      setName(row.full_name ?? '');
      setEmail(row.email ?? '');
      setPhone(row.phone ?? '');
    } catch (cause) {
      if (!isCurrentRun()) return;
      setStoredProfile(null);
      setLoadedForUserId(null);
      setError(cause instanceof Error ? cause.message : 'No se pudo cargar el cliente.');
    } finally {
      if (isCurrentRun()) setLoading(false);
    }
  }, [userId]);

  useFocusEffect(useCallback(() => {
    loadRunRef.current += 1;
    saveRunRef.current += 1;
    setStoredProfile(null);
    setLoadedForUserId(null);
    setName('');
    setEmail('');
    setPhone('');
    setError('');
    setSaving(false);
    if (userId) {
      setLoading(true);
      void load();
    } else {
      setLoading(false);
    }
    return () => { loadRunRef.current += 1; saveRunRef.current += 1; };
  }, [load, userId]));

  async function save() {
    if (!profile || profile.user_id !== userId || loading || saving || error) return;
    const boundUserId = userId;
    const saveRunId = ++saveRunRef.current;
    const isCurrentSave = () => saveRunRef.current === saveRunId
      && activeUserIdRef.current === boundUserId;
    try {
      setSaving(true);
      setError('');
      await updateAdminCustomerProfile(boundUserId, { full_name: name, phone });
      if (!isCurrentSave()) return;
      if (Platform.OS !== 'web') Alert.alert('Datos guardados', 'La información del cliente se actualizó.');
      router.back();
    } catch (cause) {
      if (!isCurrentSave()) return;
      const message = cause instanceof Error ? cause.message : 'Intenta de nuevo.';
      if (Platform.OS === 'web') setError('No se pudo guardar: ' + message);
      else Alert.alert('No se pudo guardar', message);
    } finally {
      if (isCurrentSave()) setSaving(false);
    }
  }

  return (
    <KeyboardAwareScreen>
      <AdminCustomerContextHeader customerName={adminCustomerDisplayName(profile)} section="Editar datos" subtitle="Información de contacto del cliente seleccionado." member={profile?.role === 'member'} onBack={() => router.back()} />

      {loading ? <View style={styles.loading}><ActivityIndicator color={ucapsaBrand.colors.red} /><Text style={styles.muted}>Cargando...</Text></View> : null}

      {error ? (
        <View style={styles.empty}>
          <Text accessibilityRole="alert" style={styles.error}>{error}</Text>
          {!profile ? <Pressable accessibilityRole="button" style={styles.secondary} onPress={() => { setLoading(true); void load(); }}>
            <Text style={styles.secondaryText}>Reintentar</Text>
          </Pressable> : null}
        </View>
      ) : null}

      {!loading && !profile && !error ? (
        <View style={styles.empty}>
          <MaterialIcons name="person-off" size={32} color={ucapsaBrand.colors.redDark} />
          <Text style={styles.emptyTitle}>Cliente no disponible</Text>
        </View>
      ) : null}

      {profile && !loading && !error ? (
        <View style={styles.card}>
          <Field label="Nombre" value={name} onChangeText={setName} placeholder="Nombre completo" />
          <View style={styles.field}>
            <Text style={styles.label}>Correo de acceso</Text>
            <View style={styles.readonlyField}><Text style={styles.readonlyText}>{email || 'Sin correo'}</Text></View>
            <Text style={styles.helper}>El cliente cambia este correo desde su propia cuenta para mantenerlo sincronizado con el inicio de sesión.</Text>
          </View>
          <Field label="Teléfono" value={phone} onChangeText={setPhone} placeholder="Teléfono" keyboardType="phone-pad" />
        </View>
      ) : null}

      {profile && !loading && !error ? (
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
  error: { color: ucapsaBrand.colors.danger, fontSize: 13, fontWeight: '800' },
  card: { borderRadius: 20, backgroundColor: ucapsaBrand.colors.surface, borderWidth: 1, borderColor: ucapsaBrand.colors.border, padding: 14, gap: 12 },
  field: { gap: 6 },
  label: { color: ucapsaBrand.colors.text, fontSize: 12, fontWeight: '900' },
  input: { borderWidth: 1, borderColor: ucapsaBrand.colors.border, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 11, color: ucapsaBrand.colors.text, backgroundColor: ucapsaBrand.colors.surfaceSubtle },
  readonlyField: { borderWidth: 1, borderColor: ucapsaBrand.colors.border, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 11, backgroundColor: ucapsaBrand.colors.surfaceAlt },
  readonlyText: { color: ucapsaBrand.colors.muted, fontSize: 14, fontWeight: '800' },
  helper: { color: ucapsaBrand.colors.muted, fontSize: 11, lineHeight: 16, fontWeight: '700' },
  actions: { marginTop: 14, gap: 9 },
  primary: { borderRadius: 15, backgroundColor: ucapsaBrand.colors.red, alignItems: 'center', paddingVertical: 13 },
  primaryText: { color: ucapsaBrand.colors.surface, fontWeight: '900', fontSize: 14 },
  secondary: { borderRadius: 15, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, alignItems: 'center', paddingVertical: 13 },
  secondaryText: { color: ucapsaBrand.colors.redDark, fontWeight: '900', fontSize: 14 },
});
