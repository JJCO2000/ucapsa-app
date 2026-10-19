import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import type { User } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { ucapsaBrand } from '../../constants/brand';
import { phoneOtpEnabled } from '../../constants/preregistrationFeature';
import { claimMyPreregisteredDogs } from '../../services/dog-preregistration.service';
import { confirmPhoneVerification, requestPhoneVerification } from '../../services/phone-verification.service';

/** El número en public.profiles es solo contacto, NO es identidad verificada. */
export function PhoneVerificationCard({ user }: { user: User }) {
  const [phone, setPhone] = useState(user.phone ?? '');
  const [verifiedPhone, setVerifiedPhone] = useState<string | null>(
    user.phone_confirmed_at ? user.phone ?? null : null,
  );
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setPhone(user.phone ?? '');
    if (user.phone_confirmed_at) setVerifiedPhone(user.phone ?? null);
  }, [user.id, user.phone, user.phone_confirmed_at]);

  const verified = Boolean(verifiedPhone && verifiedPhone === phone.trim());
  async function send() {
    if (busy) return;
    setBusy(true);
    try {
      const result = await requestPhoneVerification(phone, user.id);
      if (result.alreadyVerified) {
        setVerifiedPhone(result.phone);
        setSentTo(null);
      } else {
        setSentTo(result.phone);
        setCode('');
        Alert.alert('Código enviado', 'Revisa los SMS del celular que acabas de registrar.');
      }
    } catch (cause) {
      Alert.alert('No se pudo enviar el SMS',
        cause instanceof Error ? cause.message : 'Revisa el servicio de verificación.');
    } finally { setBusy(false); }
  }
  async function confirm() {
    if (!sentTo || busy) return;
    setBusy(true);
    try {
      await confirmPhoneVerification(sentTo, code, user.id);
      setVerifiedPhone(sentTo);
      setSentTo(null);
      setCode('');
      // Si el enlace falla por red/conflicto, NO informar que falló el OTP:
      // la confirmación pertenece a Auth y ya fue verificada en servidor.
      let suffix = ' Tus expedientes se vincularán cuando coincidan los datos.';
      try {
        const claimed = await claimMyPreregisteredDogs();
        if (claimed.status === 'linked') suffix = ` Se vincularon ${claimed.linkedDogs} perros a tu cuenta.`;
        else if (claimed.status === 'conflict') {
          suffix = ' La preinscripción requiere revisión de Administración por datos contradictorios.';
        }
      } catch {
        suffix = ' La vinculación queda pendiente; tu celular sí está verificado.';
      }
      Alert.alert('Celular verificado en Supabase', 'Tu número ya pertenece a esta cuenta.' + suffix);
    } catch (cause) {
      Alert.alert('No se pudo completar',
        cause instanceof Error ? cause.message : 'No se confirmó el teléfono.');
    } finally { setBusy(false); }
  }

  return (
    <View style={styles.card}>
      <View style={styles.heading}>
        <MaterialIcons name="verified-user" size={20} color={ucapsaBrand.colors.greenDark} />
        <Text style={styles.title}>Vinculación por celular</Text>
      </View>
      <Text style={styles.info}>
        {verified
          ? 'Este número está verificado por Supabase Auth.'
          : 'El teléfono escrito en tu perfil no está verificado. Para reclamar una preinscripción hay que confirmar un código SMS en esta misma cuenta.'}
      </Text>
      {verifiedPhone ? <Text style={styles.verified}>Verificado: {verifiedPhone}</Text> : null}
      {!phoneOtpEnabled ? (
        <Text style={styles.warning}>
          Envío de SMS pendiente de configurar por Administración. Tu cuenta y la vinculación por correo confirmado siguen funcionando.
        </Text>
      ) : (
        <>
          <Text style={styles.label}>Celular (+52 y diez dígitos en México)</Text>
          <TextInput value={phone} onChangeText={(value) => { setPhone(value); setSentTo(null); }}
            editable={!busy} keyboardType="phone-pad" autoCapitalize="none"
            placeholder="+525512345678" style={styles.input}
            accessibilityLabel="Número celular para recibir código de verificación" />
          {!verified ? <Pressable accessibilityRole="button"
            disabled={busy} onPress={() => void send()} style={styles.action}>
            <Text style={styles.actionText}>{busy ? 'Procesando…' : 'Enviar código SMS'}</Text>
          </Pressable> : null}
          {sentTo ? (
            <>
              <Text style={styles.label}>Código recibido por SMS</Text>
              <TextInput value={code} onChangeText={setCode} keyboardType="number-pad"
                maxLength={6} placeholder="123456" style={styles.input}
                accessibilityLabel="Código de seis dígitos" />
              <Pressable accessibilityRole="button" disabled={busy || code.trim().length !== 6}
                onPress={() => void confirm()} style={styles.action}>
                <Text style={styles.actionText}>Verificar celular</Text>
              </Pressable>
            </>
          ) : null}
        </>
      )}
    </View>
  );
}
const styles = StyleSheet.create({
  card: { backgroundColor: ucapsaBrand.colors.surface, borderColor: ucapsaBrand.colors.border,
    borderWidth: 1, padding: 14, borderRadius: 14, marginTop: 12, gap: 9 },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { color: ucapsaBrand.colors.text, fontSize: 15, fontWeight: '900' },
  info: { fontSize: 12, color: ucapsaBrand.colors.text, lineHeight: 18 },
  warning: { color: ucapsaBrand.colors.redDark, fontSize: 12, lineHeight: 18 },
  verified: { color: ucapsaBrand.colors.greenDark, fontSize: 12, fontWeight: '800' },
  label: { fontSize: 12, fontWeight: '800', color: ucapsaBrand.colors.text },
  input: { borderRadius: 9, borderWidth: 1, borderColor: ucapsaBrand.colors.border,
    paddingHorizontal: 10, minHeight: 45, color: ucapsaBrand.colors.text },
  action: { backgroundColor: ucapsaBrand.colors.greenDark, borderRadius: 10,
    padding: 12, alignItems: 'center' },
  actionText: { color: ucapsaBrand.colors.surface, fontSize: 13, fontWeight: '800' },
});
