import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { KeyboardAwareScreen } from '../components/ui/KeyboardAwareScreen';
import { ucapsaBrand } from '../constants/brand';
import { phoneVerificationEnabled } from '../constants/phoneVerification';
import { useSession } from '../hooks/useSession';
import { confirmVerifiedPhoneCode, requestVerifiedPhoneCode } from '../services/phone-verification.service';

export default function VerifyPhoneScreen() {
  const { user, isOfflineFallback } = useSession();
  const [phone, setPhone] = useState('');
  const [pendingPhone, setPendingPhone] = useState<string | null>(null);
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  if (!user || isOfflineFallback || !phoneVerificationEnabled) return <Redirect href="/account-settings?section=profile" />;

  const confirmed = Boolean(user.phone && user.phone_confirmed_at);
  async function request() {
    if (busy || !user) return;
    try {
      setBusy(true);
      const value = await requestVerifiedPhoneCode(phone);
      setPendingPhone(value);
      Alert.alert('Código solicitado', 'Revisa los mensajes SMS del celular que acabas de indicar.');
    } catch (e) {
      Alert.alert('No se pudo enviar', e instanceof Error ? e.message : 'Intenta más tarde.');
    } finally { setBusy(false); }
  }
  async function verify() {
    if (busy || !user || !pendingPhone) return;
    try {
      setBusy(true);
      await confirmVerifiedPhoneCode(pendingPhone, token, user.id);
      Alert.alert('Celular confirmado', 'Supabase verificó el número. Tu expediente se vinculará si corresponde a una única persona.');
      router.replace('/account-settings?section=profile' as never);
    } catch (e) {
      Alert.alert('No se pudo confirmar', e instanceof Error ? e.message : 'Comprueba el código.');
    } finally { setBusy(false); }
  }
  return (
    <KeyboardAwareScreen style={{ backgroundColor: ucapsaBrand.colors.background }}>
      <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.row}>
        <MaterialIcons name="arrow-back" color={ucapsaBrand.colors.redDark} size={20} />
        <Text style={styles.back}>Mi perfil</Text>
      </Pressable>
      <Text style={styles.title}>Verificar celular</Text>
      <Text style={styles.caption}>
        Confirma el número por SMS para vincular los perros que UCAPSA registró a tu nombre.
        No se crearán cuentas adicionales.
      </Text>
      {confirmed ? (
        <View style={styles.card}>
          <MaterialIcons name="verified-user" size={24} color={ucapsaBrand.colors.greenDark}/>
          <Text style={styles.label}>Celular confirmado: {user.phone}</Text>
        </View>
      ) : null}
      <View style={styles.card}>
        <Text style={styles.label}>Celular con código de país</Text>
        <TextInput style={styles.input} keyboardType="phone-pad" value={phone}
          onChangeText={setPhone} placeholder="+525512345678"
          autoComplete="tel" maxLength={20} accessibilityLabel="Número celular a verificar"/>
        <Text style={styles.caption}>El envío del SMS puede generar cargos para UCAPSA. Solicítalo únicamente cuando sea necesario.</Text>
        <Pressable accessibilityRole="button" disabled={busy || !!pendingPhone} onPress={() => void request()}
          style={[styles.action, (busy || !!pendingPhone) && styles.disabled]}>
          <Text style={styles.actionText}>{busy ? 'Procesando…' : 'Solicitar código SMS'}</Text>
        </Pressable>
        {pendingPhone ? (
          <>
            <Text style={styles.label}>Código recibido en {pendingPhone}</Text>
            <TextInput style={styles.input} keyboardType="number-pad" value={token}
              onChangeText={setToken} maxLength={6} accessibilityLabel="Código de verificación"
              placeholder="6 dígitos" />
            <Pressable accessibilityRole="button" disabled={busy || token.trim().length !== 6}
              onPress={() => void verify()} style={[styles.action, (busy || token.trim().length !== 6) && styles.disabled]}>
              <Text style={styles.actionText}>Confirmar celular</Text>
            </Pressable>
            <Pressable accessibilityRole="button" disabled={busy} onPress={() => {
              setPendingPhone(null);
              setToken('');
            }}>
              <Text style={styles.cancel}>Cambiar número</Text>
            </Pressable>
          </>
        ) : null}
        {busy ? <ActivityIndicator color={ucapsaBrand.colors.red}/> : null}
      </View>
    </KeyboardAwareScreen>
  );
}
const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 },
  back: { color: ucapsaBrand.colors.redDark, fontWeight: '800' },
  title: { fontSize: 25, fontWeight: '900', color: ucapsaBrand.colors.text },
  caption: { color: ucapsaBrand.colors.muted, fontSize: 13, lineHeight: 20, marginTop: 10 },
  card: { backgroundColor: ucapsaBrand.colors.surface, borderWidth: 1, borderColor: ucapsaBrand.colors.border,
    borderRadius: 14, padding: 16, gap: 12, marginTop: 18 },
  label: { color: ucapsaBrand.colors.text, fontSize: 14, fontWeight: '800' },
  input: { minHeight: 48, borderWidth: 1, borderColor: ucapsaBrand.colors.border, borderRadius: 10,
    paddingHorizontal: 12, color: ucapsaBrand.colors.text },
  action: { backgroundColor: ucapsaBrand.colors.redDark, borderRadius: 12, padding: 14, alignItems: 'center' },
  actionText: { color: ucapsaBrand.colors.surface, fontWeight: '900' },
  disabled: { opacity: 0.5 },
  cancel: { color: ucapsaBrand.colors.redDark, textAlign: 'center', fontWeight: '700' },
});
