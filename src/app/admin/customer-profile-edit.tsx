import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { AdminCustomerContextHeader, adminCustomerDisplayName } from '../../components/domain/AdminCustomerContextHeader';
import { KeyboardAwareScreen } from '../../components/ui/KeyboardAwareScreen';
import { ucapsaBrand } from '../../constants/brand';
import { getProfileByUserId, updateAdminCustomerProfile } from '../../services/profiles.service';
import { activateCustomerPhoneLogin } from '../../services/admin-phone-login.service';
import { useSession } from '../../hooks/useSession';
import { sameContactPhone } from '../../utils/phone-contact';
import type { Profile } from '../../types/app.types';

export default function CustomerProfileEditScreen() {
  const { role } = useSession();
  const params = useLocalSearchParams<{ userId?: string }>();
  const userId = typeof params.userId === 'string' ? params.userId.trim() : '';
  const [profile, setProfile] = useState<Profile | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [phoneActivating, setPhoneActivating] = useState(false);
  const [staffConfirmedPhone, setStaffConfirmedPhone] = useState(false);
  const [phoneAccessMessage, setPhoneAccessMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId) return;
    const row = await getProfileByUserId(userId);
    setProfile(row);
    setName(row?.full_name ?? '');
    setEmail(row?.email ?? '');
    setPhone(row?.phone ?? '');
    setStaffConfirmedPhone(false);
    setPhoneAccessMessage(null);
  }, [userId]);

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
        phone,
      });
      Alert.alert('Datos guardados', 'La información del cliente se actualizó.');
      router.back();
    } catch (cause) {
      Alert.alert('No se pudo guardar', cause instanceof Error ? cause.message : 'Intenta de nuevo.');
    } finally {
      setSaving(false);
    }
  }

  const canActivatePhone = role === 'super_admin' && !!profile &&
    (profile.role === 'client' || profile.role === 'member') && !!profile.phone &&
    sameContactPhone(profile.phone, phone);
  async function activatePhone() {
    if (!canActivatePhone || !staffConfirmedPhone || phoneActivating || saving) return;
    setPhoneActivating(true);
    setPhoneAccessMessage(null);
    try {
      const result = await activateCustomerPhoneLogin(userId);
      setPhoneAccessMessage(result.alreadyActive
        ? 'El celular ya estaba habilitado para entrar con la contraseña de esta cuenta.'
        : result.auditPending
          ? 'Celular asociado a la cuenta. Administración debe revisar el cierre de auditoría.'
          : 'Celular asociado a la misma cuenta de Auth. Puede iniciar sesión con celular y contraseña si el proveedor telefónico está habilitado.');
      setStaffConfirmedPhone(false);
    } catch (cause) {
      setPhoneAccessMessage(cause instanceof Error ? cause.message : 'No fue posible activar el celular.');
    } finally {
      setPhoneActivating(false);
    }
  }

  return (
    <KeyboardAwareScreen>
      <AdminCustomerContextHeader customerName={adminCustomerDisplayName(profile)} section="Editar datos" subtitle="Información de contacto del cliente seleccionado." member={profile?.role === 'member'} onBack={() => router.back()} />

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
          <View style={styles.field}>
            <Text style={styles.label}>Correo de acceso</Text>
            <View style={styles.readonlyField}><Text style={styles.readonlyText}>{email || 'Sin correo'}</Text></View>
            <Text style={styles.helper}>El cliente cambia este correo desde su propia cuenta para mantenerlo sincronizado con el inicio de sesión.</Text>
          </View>
          <Field label="Celular principal" value={phone} onChangeText={(value) => {
            setPhone(value);
            setStaffConfirmedPhone(false);
            setPhoneAccessMessage(null);
          }} placeholder="Celular" keyboardType="phone-pad" />
          {role === 'super_admin' && (profile.role === 'client' || profile.role === 'member') ? (
            <View style={styles.phoneActivation}>
              <Text style={styles.label}>Acceso con celular (MVP, solo Superadmin)</Text>
              <Text style={styles.helper}>Usa la misma cuenta y contraseña. No envía SMS ni crea otro usuario. Guarda primero el celular. Si otra cuenta lo utiliza, UCAPSA bloqueará la activación.</Text>
              <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: staffConfirmedPhone, disabled: !canActivatePhone }}
                disabled={!canActivatePhone || phoneActivating} style={styles.confirmationRow}
                onPress={() => setStaffConfirmedPhone(value => !value)}>
                <MaterialIcons name={staffConfirmedPhone ? 'check-box' : 'check-box-outline-blank'} size={24} color={ucapsaBrand.colors.redDark} />
                <Text style={[styles.helper, { flex: 1 }]}>Confirmé con el cliente que este es su celular y que debo habilitarlo para acceso.</Text>
              </Pressable>
              <Pressable accessibilityRole="button" disabled={!canActivatePhone || !staffConfirmedPhone || phoneActivating || saving}
                style={[styles.secondary, (!canActivatePhone || !staffConfirmedPhone || phoneActivating || saving) && styles.disabled]}
                onPress={() => void activatePhone()}>
                <Text style={styles.secondaryText}>{phoneActivating ? 'Activando...' : 'Habilitar acceso con celular'}</Text>
              </Pressable>
              {phoneAccessMessage ? <Text accessibilityRole="alert" style={styles.helper}>{phoneAccessMessage}</Text> : null}
            </View>
          ) : null}
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
  phoneActivation: { gap: 9, paddingTop: 9, borderTopWidth: 1, borderTopColor: ucapsaBrand.colors.border },
  confirmationRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 7 },
  disabled: { opacity: 0.5 },
});
