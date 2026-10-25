import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { KeyboardAwareScreen } from '../../components/ui/KeyboardAwareScreen';
import { PreregistrationFamilyEditor } from '../../components/domain/PreregistrationFamilyEditor';
import { PreregistrationPrivacyNotice } from '../../components/domain/PreregistrationPrivacyNotice';
import { NoticeDeliverySelector } from '../../components/domain/NoticeDeliverySelector';
import type { NoticeDeliveryMethod } from '../../constants/privacy-notice-delivery';
import type { FamilyMemberInput } from '../../services/preregistration-family.service';
import { ucapsaBrand } from '../../constants/brand';
import { preregistrationEnabled } from '../../constants/preregistrationFeature';
import { useSession } from '../../hooks/useSession';
import { devWarn } from '../../lib/client-diagnostics';
import { staffPreregisterDogWithProgram } from '../../services/dog-preregistration.service';
import { normalizeContactPhone } from '../../utils/phone-contact';

type Program = 'puppy' | 'comandos';
type Level = 'principiante' | 'medio' | 'avanzado';

export default function StaffPreregisterDogScreen() {
  const { isStaff, isAdmin } = useSession();
  const [ownerName, setOwnerName] = useState('');
  const [ownerPhone, setOwnerPhone] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [familyMembers, setFamilyMembers] = useState<FamilyMemberInput[]>([]);
  const [ownerNoticeMethod, setOwnerNoticeMethod] = useState<NoticeDeliveryMethod | null>(null);
  const [dogName, setDogName] = useState('');
  const [programCode, setProgramCode] = useState<Program>('puppy');
  const [level, setLevel] = useState<Level>('principiante');
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ kind: 'success' | 'error'; message: string } | null>(null);

  function clear() {
    setOwnerName(''); setOwnerPhone(''); setOwnerEmail('');
    setFamilyMembers([]);
    setOwnerNoticeMethod(null);
    setDogName(''); setProgramCode('puppy'); setLevel('principiante');
  }

  function fail(message: string) {
    if (Platform.OS === 'web') setNotice({ kind: 'error', message });
    else Alert.alert('No se pudo preinscribir', message);
  }

  async function save() {
    if (saving) return;
    setNotice(null);
    if (!ownerName.trim() || !dogName.trim() || (!ownerPhone.trim() && !ownerEmail.trim())) {
      fail('Escribe el tutor, su perro y al menos un contacto: celular o correo.');
      return;
    }
    if (ownerEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerEmail.trim())) {
      fail('Escribe un correo válido o déjalo vacío.');
      return;
    }
    if (ownerPhone.trim()) {
      try { normalizeContactPhone(ownerPhone); }
      catch (error) {
        devWarn('staff-preregister-dog: invalid phone entry.', error);
        fail(error instanceof Error ? error.message : 'Celular inválido.');
        return;
      }
    }
    try {
      setSaving(true);
      if (!ownerNoticeMethod) throw new Error('Confirma cómo entregaste el aviso de privacidad al titular.');
      await staffPreregisterDogWithProgram({
        ownerName, ownerEmail, ownerPhone, dogName, programCode,
        programLevel: programCode === 'puppy' ? 'base' : level, familyMembers,
        ownerNoticeDeliveryMethod: ownerNoticeMethod,
      });
      const message = 'Preinscripción guardada.' + (familyMembers.length
        ? ' Familia: ' + familyMembers.length + ' integrante(s) añadido(s) sin acceso automático.' : '')
        + ' No se crearon cuentas ni se registraron pagos.';
      if (Platform.OS === 'web') {
        clear();
        setNotice({ kind: 'success', message: message + ' Puedes registrar otra persona.' });
      } else {
        Alert.alert('Preinscripción guardada', message, [
          { text: 'Otra persona', onPress: clear },
          { text: 'Finalizar', onPress: () => router.back() },
        ]);
      }
    } catch (error) {
      devWarn('staff-preregister-dog: failed to save preregistration.', error);
      fail(error instanceof Error ? error.message : 'Revisa los datos e inténtalo de nuevo.');
    } finally {
      setSaving(false);
    }
  }

  if (!isStaff || !preregistrationEnabled) return <Redirect href={isAdmin ? '/admin-home' : '/home'} />;

  return (
    <KeyboardAwareScreen>
      <Pressable accessibilityRole="button" style={styles.back} onPress={() => router.back()}>
        <MaterialIcons name="arrow-back" size={20} color={ucapsaBrand.colors.redDark} />
        <Text style={styles.backText}>Inicio</Text>
      </Pressable>
      <Text style={styles.eyebrow}>UCAPSA · Personal autorizado</Text>
      <Text style={styles.heading}>Preinscribir</Text>
      <Text style={styles.description}>
        Captura rápida de un nuevo tutor y su perro en Puppy o Comandos.
        No crea una cuenta y no acredita pagos, membresías ni asistencias anteriores.
      </Text>

      {notice ? (
        <View style={styles.notice}>
          <Text accessibilityRole={notice.kind === 'error' ? 'alert' : 'text'}
            style={[styles.helper, { color: notice.kind === 'error' ? ucapsaBrand.colors.danger : ucapsaBrand.colors.greenDark }]}>
            {notice.message}
          </Text>
        </View>
      ) : null}

      <View style={styles.card}>
        <Text style={styles.label}>Tutor</Text>
        <TextInput style={styles.input} value={ownerName} onChangeText={setOwnerName}
          placeholder="Nombre completo" maxLength={120} autoCapitalize="words"
          placeholderTextColor={ucapsaBrand.colors.muted} />

        <Text style={styles.label}>Celular (preferente)</Text>
        <TextInput style={styles.input} value={ownerPhone} onChangeText={setOwnerPhone}
          placeholder="55 3510 0214" keyboardType="phone-pad" maxLength={20}
          placeholderTextColor={ucapsaBrand.colors.muted} />

        <Text style={styles.label}>Correo (opcional)</Text>
        <TextInput style={styles.input} value={ownerEmail} onChangeText={setOwnerEmail}
          placeholder="tutor@ejemplo.com" keyboardType="email-address" autoCapitalize="none"
          autoCorrect={false} maxLength={254} placeholderTextColor={ucapsaBrand.colors.muted} />
        <Text style={styles.helper}>
          Se requiere al menos un contacto correcto. La primera vinculación puede hacerse
          por coincidencia de correo o teléfono: comprueba bien los datos con el tutor.
        </Text>

        <Text style={styles.label}>Perro</Text>
        <TextInput style={styles.input} value={dogName} onChangeText={setDogName}
          placeholder="Nombre del perro" autoCapitalize="words" maxLength={80}
          placeholderTextColor={ucapsaBrand.colors.muted} />

        <Text style={styles.label}>Programa</Text>
        <View style={styles.choices}>
          {(['puppy', 'comandos'] as const).map((value) => (
            <Pressable key={value} accessibilityRole="button"
              accessibilityState={{ selected: programCode === value }}
              style={[styles.choice, programCode === value && styles.active]}
              onPress={() => setProgramCode(value)}>
              <Text style={[styles.choiceText, programCode === value && styles.activeText]}>
                {value === 'puppy' ? 'Puppy' : 'Comandos'}
              </Text>
            </Pressable>
          ))}
        </View>
        {programCode === 'comandos' ? (
          <>
            <Text style={styles.label}>Nivel de Comandos</Text>
            <View style={styles.choices}>
              {([['principiante', 'Básico'], ['medio', 'Intermedio'], ['avanzado', 'Avanzado']] as const)
                .map(([value, text]) => (
                  <Pressable key={value} accessibilityRole="button"
                    accessibilityState={{ selected: level === value }}
                    style={[styles.choice, level === value && styles.active]}
                    onPress={() => setLevel(value)}>
                    <Text style={[styles.choiceText, level === value && styles.activeText]}>{text}</Text>
                  </Pressable>
                ))}
            </View>
          </>
        ) : null}
      </View>

      <PreregistrationFamilyEditor value={familyMembers} onChange={setFamilyMembers} disabled={saving} />
      <PreregistrationPrivacyNotice />
      <NoticeDeliverySelector value={ownerNoticeMethod} onChange={setOwnerNoticeMethod}
        disabled={saving} label="Entrega del aviso al titular" />

      <Pressable accessibilityRole="button" disabled={saving}
        style={[styles.saveButton, saving && styles.disabled]} onPress={() => void save()}>
        {saving ? <ActivityIndicator color={ucapsaBrand.colors.surface} /> :
          <MaterialIcons name="person-add" size={22} color={ucapsaBrand.colors.surface} />}
        <Text style={styles.saveText}>{saving ? 'Guardando…' : 'Guardar preinscripción'}</Text>
      </Pressable>
      <Text style={styles.helper}>
        Si el tutor ya tiene una cuenta o necesitas corregir tarjetas, historial,
        membresías o vinculaciones, remite el caso a Administración.
      </Text>
    </KeyboardAwareScreen>
  );
}

const styles = StyleSheet.create({
  back: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 16 },
  backText: { color: ucapsaBrand.colors.redDark, fontSize: 13, fontWeight: '900' },
  eyebrow: { color: ucapsaBrand.colors.redDark, fontSize: 11, fontWeight: '900', letterSpacing: 0.5 },
  heading: { color: ucapsaBrand.colors.text, fontSize: 27, fontWeight: '900', marginTop: 4 },
  description: { color: ucapsaBrand.colors.muted, fontSize: 13, lineHeight: 19, marginVertical: 12 },
  card: { backgroundColor: ucapsaBrand.colors.surface, borderRadius: 18,
    borderColor: ucapsaBrand.colors.border, borderWidth: 1, padding: 16, marginVertical: 12 },
  label: { color: ucapsaBrand.colors.text, fontWeight: '900', fontSize: 13, marginTop: 13, marginBottom: 7 },
  input: { minHeight: 48, borderWidth: 1, borderColor: ucapsaBrand.colors.border,
    borderRadius: 12, color: ucapsaBrand.colors.text, paddingHorizontal: 13, fontSize: 15 },
  helper: { color: ucapsaBrand.colors.muted, fontSize: 12, lineHeight: 18, marginTop: 8 },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  choice: { borderWidth: 1, borderColor: ucapsaBrand.colors.border,
    paddingHorizontal: 14, paddingVertical: 12, borderRadius: 12 },
  choiceText: { color: ucapsaBrand.colors.text, fontWeight: '800', fontSize: 13 },
  active: { backgroundColor: ucapsaBrand.colors.redDark, borderColor: ucapsaBrand.colors.redDark },
  activeText: { color: ucapsaBrand.colors.surface },
  saveButton: { borderRadius: 16, minHeight: 54, backgroundColor: ucapsaBrand.colors.greenDark,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  saveText: { color: ucapsaBrand.colors.surface, fontWeight: '900', fontSize: 15 },
  notice: { backgroundColor: ucapsaBrand.colors.surface, borderWidth: 1,
    borderColor: ucapsaBrand.colors.border, borderRadius: 12, padding: 10, marginTop: 12 },
  disabled: { opacity: 0.6 },
});
