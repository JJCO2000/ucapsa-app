import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { AdminCustomerContextHeader, adminCustomerDisplayName } from '../../components/domain/AdminCustomerContextHeader';
import { KeyboardAwareScreen } from '../../components/ui/KeyboardAwareScreen';
import { ucapsaBrand } from '../../constants/brand';
import { useSession } from '../../hooks/useSession';
import { devWarn } from '../../lib/client-diagnostics';
import { createDogForUserAdmin, getDogsForUser, type BasicDog } from '../../services/dogs.service';
import { getProfileByUserId } from '../../services/profiles.service';
import type { Profile } from '../../types/app.types';
import { showStaffDialog } from '../../utils/staff-dialog';

export default function CustomerDogAddScreen() {
  const { userId: rawUserId } = useLocalSearchParams<{ userId?: string | string[] }>();
  const userId = typeof rawUserId === 'string' ? rawUserId.trim() : '';
  const { isAdmin } = useSession();
  const activeUserIdRef = useRef(userId);
  activeUserIdRef.current = userId;
  const loadRunRef = useRef(0);
  const saveRunRef = useRef(0);
  const savingRef = useRef(false);
  const [storedProfile, setStoredProfile] = useState<Profile | null>(null);
  const [loadedForUserId, setLoadedForUserId] = useState<string | null>(null);
  const profile = loadedForUserId === userId ? storedProfile : null;
  const [dogs, setDogs] = useState<BasicDog[]>([]);
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saveError, setSaveError] = useState('');

  const load = useCallback(async () => {
    if (!userId || !isAdmin) return;
    const runId = ++loadRunRef.current;
    const isCurrentRun = () => loadRunRef.current === runId && activeUserIdRef.current === userId;
    setLoading(true);
    setError('');
    setStoredProfile(null);
    setLoadedForUserId(null);
    setDogs([]);
    try {
      const [nextProfile, nextDogs] = await Promise.all([
        getProfileByUserId(userId), getDogsForUser(userId),
      ]);
      if (!isCurrentRun()) return;
      if (!nextProfile || nextProfile.user_id !== userId) {
        throw new Error('No se pudo comprobar la identidad del cliente.');
      }
      setStoredProfile(nextProfile);
      setLoadedForUserId(userId);
      setDogs(nextDogs);
    } catch (cause) {
      if (!isCurrentRun()) return;
      setStoredProfile(null);
      setLoadedForUserId(null);
      setDogs([]);
      setError(cause instanceof Error ? cause.message : 'No se pudo consultar la cuenta.');
    } finally {
      if (isCurrentRun()) setLoading(false);
    }
  }, [isAdmin, userId]);

  useFocusEffect(useCallback(() => {
    loadRunRef.current += 1;
    saveRunRef.current += 1;
    savingRef.current = false;
    setSaving(false);
    setStoredProfile(null);
    setLoadedForUserId(null);
    setDogs([]);
    setName('');
    setSaveError('');
    if (userId && isAdmin) void load();
    else { setLoading(false); setError('Cliente no disponible.'); }
    return () => { loadRunRef.current += 1; saveRunRef.current += 1; };
  }, [isAdmin, load, userId]));

  async function saveDog() {
    if (!profile || profile.user_id !== userId || !isAdmin || loading || saving || savingRef.current || error) return;
    const cleanName = name.trim();
    if (!cleanName || cleanName.length > 80 || /[\x00-\x1f\x7f]/.test(cleanName)) {
      setSaveError('Escribe un nombre de perro válido (máximo 80 caracteres).');
      return;
    }
    if (dogs.some((dog) => dog.name.trim().toLocaleLowerCase('es-MX') === cleanName.toLocaleLowerCase('es-MX'))) {
      setSaveError('Este cliente ya tiene un perro activo con ese nombre. Selecciona el perro existente desde Clases.');
      return;
    }

    const boundUserId = userId;
    const saveRunId = ++saveRunRef.current;
    const isCurrentSave = () => saveRunRef.current === saveRunId
      && activeUserIdRef.current === boundUserId;
    const customerName = adminCustomerDisplayName(profile);

    savingRef.current = true;
    setSaving(true);
    setSaveError('');
    try {
      const created = await createDogForUserAdmin(boundUserId, cleanName);
      if (!isCurrentSave()) return;
      if (!created.id || created.name.trim().toLocaleLowerCase('es-MX') !== cleanName.toLocaleLowerCase('es-MX')) {
        throw new Error('No se pudo confirmar el perro registrado.');
      }
      showStaffDialog('Perro registrado',
        cleanName + ' quedó asociado a ' + customerName +
        '. No se creó inscripción, asistencia, membresía ni pago.');
      router.back();
    } catch (cause) {
      if (!isCurrentSave()) return;
      devWarn('admin-customer-dog-add: could not create a dog.', cause);
      setSaveError(cause instanceof Error ? cause.message : 'No se pudo registrar el perro.');
    } finally {
      savingRef.current = false;
      if (isCurrentSave()) setSaving(false);
    }
  }

  return (
    <KeyboardAwareScreen>
      <AdminCustomerContextHeader
        customerName={adminCustomerDisplayName(profile)}
        section="Añadir perro"
        subtitle="Registrar un perro a la cuenta del cliente seleccionado."
        member={profile?.role === 'member'}
        onBack={() => router.back()}
      />
      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={ucapsaBrand.colors.red} />
          <Text style={styles.muted}>Verificando cuenta...</Text>
        </View>
      ) : null}
      {error ? (
        <View style={styles.card}>
          <Text accessibilityRole="alert" style={styles.error}>{error}</Text>
          <Pressable accessibilityRole="button" style={styles.secondary} onPress={() => void load()}>
            <Text style={styles.secondaryText}>Reintentar</Text>
          </Pressable>
        </View>
      ) : null}
      {profile && !loading && !error ? (
        <>
          <View style={styles.card}>
            <Text style={styles.label}>Perros registrados ({dogs.length})</Text>
            <Text style={styles.muted}>{dogs.length ? dogs.map((dog) => dog.name).join(' · ') : 'Este cliente aún no tiene perros registrados.'}</Text>
          </View>
          <View style={styles.card}>
            <Text style={styles.label}>Nombre del nuevo perro</Text>
            <TextInput
              accessibilityLabel="Nombre del nuevo perro"
              autoCapitalize="words"
              autoCorrect={false}
              maxLength={80}
              editable={!saving}
              placeholder="Ej. Luna"
              placeholderTextColor={ucapsaBrand.colors.muted}
              style={styles.input}
              value={name}
              onChangeText={(value) => { setName(value); setSaveError(''); }}
            />
            <Text style={styles.muted}>
              Esta acción solo crea el perfil del perro. Para inscribirlo a Puppy o Comandos, abre Clases.
            </Text>
            {saveError ? <Text accessibilityRole="alert" style={styles.error}>{saveError}</Text> : null}
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Registrar perro"
            disabled={saving} style={[styles.primary, saving && styles.disabled]}
            onPress={() => void saveDog()}>
            {saving ? <ActivityIndicator color={ucapsaBrand.colors.surface} /> :
              <MaterialIcons name="pets" size={20} color={ucapsaBrand.colors.surface} />}
            <Text style={styles.primaryText}>{saving ? 'Registrando...' : 'Registrar perro'}</Text>
          </Pressable>
        </>
      ) : null}
    </KeyboardAwareScreen>
  );
}

const styles = StyleSheet.create({
  loading: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 14 },
  card: { borderWidth: 1, borderColor: ucapsaBrand.colors.border, borderRadius: 17, padding: 16,
    backgroundColor: ucapsaBrand.colors.surface, marginBottom: 14, gap: 9 },
  label: { color: ucapsaBrand.colors.text, fontSize: 14, fontWeight: '900' },
  muted: { color: ucapsaBrand.colors.muted, fontSize: 12, lineHeight: 18, fontWeight: '700' },
  error: { color: ucapsaBrand.colors.danger, fontSize: 12, fontWeight: '800', lineHeight: 17 },
  input: { borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.background,
    borderRadius: 12, paddingHorizontal: 13, height: 50, color: ucapsaBrand.colors.text, fontSize: 15 },
  primary: { minHeight: 52, borderRadius: 14, backgroundColor: ucapsaBrand.colors.red,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 },
  primaryText: { color: ucapsaBrand.colors.surface, fontSize: 14, fontWeight: '900' },
  secondary: { minHeight: 44, borderWidth: 1, borderRadius: 12, borderColor: ucapsaBrand.colors.border,
    justifyContent: 'center', alignItems: 'center' },
  secondaryText: { color: ucapsaBrand.colors.redDark, fontSize: 13, fontWeight: '800' },
  disabled: { opacity: 0.6 },
});
