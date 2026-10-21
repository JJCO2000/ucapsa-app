import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import { KeyboardAwareScreen } from '../../components/ui/KeyboardAwareScreen';
import { ucapsaBrand } from '../../constants/brand';
import { useSession } from '../../hooks/useSession';
import { approveAdminPhoneAccess, getAdminPhoneAccessStatus, type AdminPhoneAccessResult } from '../../services/admin-phone-access.service';

const guidance: Record<string, string> = {
  ready: 'El contacto es válido y no está repetido en otros perfiles. Falta comprobar en una llamada real que pertenece a esta persona.',
  already_active: 'Este celular ya está confirmado en Supabase Auth. La misma cuenta puede usarlo con su contraseña, siempre que el proveedor de teléfono esté habilitado.',
  conflict: 'Hay otra cuenta con este celular. No se puede habilitar el acceso sin resolver la duplicidad con Administración.',
  missing: 'Primero guarda el celular principal en los datos del cliente.',
  invalid: 'El contacto existente no tiene formato válido. Corrígelo en los datos del cliente antes de continuar.',
  different_auth_phone: 'Auth ya tiene un celular diferente. Requiere revisión y cambio de titularidad; no lo sobrescribas.',
  enabled: 'Supabase confirmó la asociación con esta misma cuenta. No se creó ningún usuario ni se cambió la contraseña.',
};

export default function AdminCustomerPhoneAccessScreen() {
  const { loading: sessionLoading, role } = useSession();
  const params = useLocalSearchParams<{ userId?: string }>();
  const userId = typeof params.userId === 'string' ? params.userId.trim() : '';
  const [result, setResult] = useState<AdminPhoneAccessResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [proofNote, setProofNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (sessionLoading || role !== 'super_admin' || !userId) return;
    let active = true;
    setLoading(true);
    void getAdminPhoneAccessStatus(userId).then((data) => {
      if (active) { setResult(data); setError(null); }
    }).catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason.message : 'No se pudo comprobar el estado del celular.');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [role, sessionLoading, userId]);

  async function callPhone() {
    if (!result?.phone) return;
    try {
      const url = 'tel:' + result.phone;
      if (!await Linking.canOpenURL(url)) throw new Error('Este dispositivo no admite llamadas. Hazla desde un teléfono externo.');
      await Linking.openURL(url);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo abrir la aplicación de llamadas.');
    }
  }

  async function approve() {
    if (!userId || result?.status !== 'ready' || !confirmed || saving) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await approveAdminPhoneAccess(userId, proofNote);
      setResult(updated);
      setConfirmed(false);
      setProofNote('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo autorizar. No repitas la operación sin comprobar el estado.');
    } finally {
      setSaving(false);
    }
  }

  if (sessionLoading) return <KeyboardAwareScreen><ActivityIndicator color={ucapsaBrand.colors.red}/></KeyboardAwareScreen>;
  if (role !== 'super_admin') return <Redirect href="/admin-home" />;
  return (
    <KeyboardAwareScreen>
      <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.back}>
        <MaterialIcons name="arrow-back" size={22} color={ucapsaBrand.colors.redDark}/><Text style={styles.link}>Volver</Text>
      </Pressable>
      <Text style={styles.title}>Acceso por celular</Text>
      <Text style={styles.text}>Una sola cuenta, un solo celular principal y la misma contraseña. Esta operación sólo habilita el acceso cuando Superadmin ha comprobado personalmente la titularidad del número.</Text>
      {loading ? <ActivityIndicator color={ucapsaBrand.colors.red}/> : (
        <View style={styles.panel}>
          <Text style={styles.label}>Celular principal del expediente</Text>
          <Text style={styles.phone}>{result?.phone || 'No disponible'}</Text>
          <Text style={styles.text}>{result ? guidance[result.status] : 'Sin consulta disponible.'}</Text>
          {result?.status === 'ready' ? (
            <>
              <Pressable accessibilityRole="button" style={styles.secondary} onPress={() => void callPhone()}>
                <MaterialIcons name="phone" size={20} color={ucapsaBrand.colors.redDark}/><Text style={styles.link}>Llamar al número registrado</Text>
              </Pressable>
              <Text style={styles.text}>Comprueba mediante una llamada saliente que el titular de esta cuenta responde en ese celular. Verifica también su identidad utilizando el procedimiento presencial de UCAPSA. No basta con que el número aparezca en el perfil.</Text>
              <View style={styles.confirmRow}>
                <Switch accessibilityLabel="Confirmé por llamada y verifiqué al titular" value={confirmed} onValueChange={setConfirmed}/>
                <Text style={[styles.text, { flex: 1 }]}>Confirmo que hablé con el titular por llamada a este número y comprobé su identidad.</Text>
              </View>
              <Text style={styles.label}>Nota de verificación (sin datos sensibles)</Text>
              <TextInput accessibilityLabel="Nota de verificación" style={styles.input} multiline value={proofNote} onChangeText={setProofNote} placeholder="Ej.: Llamada saliente atendida por el titular, identidad contrastada con su ficha UCAPSA." maxLength={300}/>
              <Pressable accessibilityRole="button" disabled={!confirmed || proofNote.trim().length < 20 || saving} onPress={() => void approve()} style={[styles.primary, (!confirmed || proofNote.trim().length < 20 || saving) && styles.disabled]}>
                <Text style={styles.primaryText}>{saving ? 'Validando…' : 'Habilitar este celular en Auth'}</Text>
              </Pressable>
            </>
          ) : null}
        </View>
      )}
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      <Text style={styles.text}>Las decisiones se validan de nuevo en Supabase y quedan registradas en auditoría. Los números compartidos, no válidos o previamente asociados se rechazan. No se envían SMS ni se crean cuentas.</Text>
    </KeyboardAwareScreen>
  );
}

const styles = StyleSheet.create({
  back: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 },
  link: { color: ucapsaBrand.colors.redDark, fontWeight: '800' },
  title: { color: ucapsaBrand.colors.text, fontSize: 25, fontWeight: '900', marginVertical: 12 },
  text: { color: ucapsaBrand.colors.muted, fontSize: 13, lineHeight: 19, marginTop: 8 },
  label: { color: ucapsaBrand.colors.text, fontSize: 13, fontWeight: '800' },
  phone: { color: ucapsaBrand.colors.text, fontSize: 21, fontWeight: '900' },
  panel: { marginTop: 16, borderRadius: 20, padding: 16, backgroundColor: ucapsaBrand.colors.surface, borderWidth: 1, borderColor: ucapsaBrand.colors.border, gap: 10 },
  secondary: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderWidth: 1, borderRadius: 12, borderColor: ucapsaBrand.colors.border },
  confirmRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  input: { minHeight: 76, borderWidth: 1, borderColor: ucapsaBrand.colors.border, borderRadius: 12, padding: 10, color: ucapsaBrand.colors.text, textAlignVertical: 'top' },
  primary: { padding: 16, alignItems: 'center', borderRadius: 14, backgroundColor: ucapsaBrand.colors.red },
  primaryText: { color: ucapsaBrand.colors.surface, fontWeight: '900' },
  disabled: { opacity: 0.45 },
  error: { color: ucapsaBrand.colors.danger, fontWeight: '800', marginTop: 12 },
});
