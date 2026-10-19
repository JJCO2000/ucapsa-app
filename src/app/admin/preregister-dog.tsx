import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { KeyboardAwareScreen } from '../../components/ui/KeyboardAwareScreen';
import { ucapsaBrand } from '../../constants/brand';
import { preregistrationEnabled } from '../../constants/preregistrationFeature';
import { useSession } from '../../hooks/useSession';
import { adminPreregisterDogWithProgram } from '../../services/dog-preregistration.service';

export default function AdminPreregisterDogScreen() {
  const { isAdmin } = useSession();
  const [ownerName, setOwnerName] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [ownerPhone, setOwnerPhone] = useState('');
  const [dogName, setDogName] = useState('');
  const [programCode, setProgramCode] = useState<'puppy'|'comandos'>('puppy');
  const [level, setLevel] = useState<'principiante'|'medio'|'avanzado'>('principiante');
  const [cardNumber, setCardNumber] = useState('');
  const [cardStartedOn, setCardStartedOn] = useState('');
  const [totalAttendances, setTotalAttendances] = useState('0');
  const [includeDates, setIncludeDates] = useState(false);
  const [datesText, setDatesText] = useState('');
  const [sourceNote, setSourceNote] = useState('');
  const [saving, setSaving] = useState(false);

  async function save() {
    if (saving) return;
    if (!ownerName.trim() || !dogName.trim() || (!ownerPhone.trim() && !ownerEmail.trim())) {
      Alert.alert('Faltan datos', 'Escribe el tutor, el perro y un celular. Si no tiene, puedes usar correo.');
      return;
    }
    if (ownerEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerEmail.trim())) {
      Alert.alert('Correo inválido', 'Escribe un correo electrónico válido para vincular la cuenta.');
      return;
    }
    if (ownerPhone.trim() && !/^\+[1-9][0-9]{7,14}$/.test(ownerPhone.trim())) {
      Alert.alert('Celular inválido', 'Usa el formato internacional, por ejemplo +525512345678.');
      return;
    }
    try {
      setSaving(true);
      const count = Number(totalAttendances.trim());
      const dates = includeDates ? datesText.split(/[\n,;]+/).map((d) => d.trim()).filter(Boolean) : [];
      if (!Number.isSafeInteger(count) || count < 0 || count > 500) {
        throw new Error('Indica un número de asistencias válido (0 a 500).');
      }
      if (dates.some((d) => !/^\d{4}-\d{2}-\d{2}$/.test(d))) {
        throw new Error('Las fechas deben usar AAAA-MM-DD.');
      }
      if (new Set(dates).size !== dates.length || dates.length > count) {
        throw new Error('No repitas fechas ni superes el total de asistencias.');
      }
      if (cardStartedOn.trim() && !/^\d{4}-\d{2}-\d{2}$/.test(cardStartedOn.trim())) {
        throw new Error('El inicio de tarjeta debe usar AAAA-MM-DD.');
      }
      await adminPreregisterDogWithProgram({
        ownerName, ownerEmail: ownerEmail.trim().toLowerCase(), ownerPhone: ownerPhone.trim(), dogName,
        programCode, programLevel: programCode === 'puppy' ? 'base' : level,
        physicalCardNumber: programCode === 'puppy' ? cardNumber : '',
        cardStartedOn: programCode === 'puppy' ? (cardStartedOn.trim() || null) : null,
        totalAttendances: count, knownAttendanceDates: dates, sourceNote,
      });
      Alert.alert('Perro preinscrito',
        'El expediente se vinculará cuando el tutor verifique el mismo celular en Supabase Auth (o su correo alternativo) y no haya conflictos.',
        [{ text: 'Listo', onPress: () => router.back() }]);
    } catch (cause) {
      Alert.alert('No se pudo preinscribir',
        cause instanceof Error ? cause.message : 'Revisa la información e inténtalo nuevamente.');
    } finally {
      setSaving(false);
    }
  }

  const knownCount = includeDates
    ? datesText.split(/[\n,;]+/).filter((value) => value.trim()).length
    : 0;
  const unknownCount = Math.max(0, Number(totalAttendances || 0) - knownCount);
  // No exponer formulario cuando las migraciones aún no están instaladas.
  if (!isAdmin || !preregistrationEnabled) return <Redirect href="/home" />;

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
        verificar su celular con un código SMS. El correo verificado también sirve como alternativa.
      </Text>

      <View style={styles.card}>
        <Text style={styles.label}>Nombre del tutor</Text>
        <TextInput style={styles.input} value={ownerName} onChangeText={setOwnerName}
          autoCapitalize="words" autoCorrect={false} maxLength={120}
          placeholder="Nombre del tutor" placeholderTextColor={ucapsaBrand.colors.muted} />

        <Text style={styles.label}>Correo del tutor (alternativo y opcional)</Text>
        <TextInput style={styles.input} value={ownerEmail} onChangeText={setOwnerEmail}
          autoCapitalize="none" keyboardType="email-address" autoCorrect={false}
          maxLength={254} placeholder="correo@ejemplo.com"
          placeholderTextColor={ucapsaBrand.colors.muted} />

        <Text style={styles.label}>Celular del tutor (principal)</Text>
        <TextInput style={styles.input} value={ownerPhone} onChangeText={setOwnerPhone}
          keyboardType="phone-pad" maxLength={16} placeholder="+525512345678"
          placeholderTextColor={ucapsaBrand.colors.muted} />
        <Text style={styles.helper}>Usa +52 y los 10 dígitos de México. El tutor debe verificar ese número desde su cuenta antes de vincular el expediente. El correo es una alternativa.</Text>

        <Text style={styles.label}>Nombre del perro</Text>
        <TextInput style={styles.input} value={dogName} onChangeText={setDogName}
          autoCapitalize="words" maxLength={80} placeholder="Nombre del perro"
          placeholderTextColor={ucapsaBrand.colors.muted} />

        <Text style={styles.label}>Programa</Text>
        <View style={styles.choiceRow}>
          {(['puppy','comandos'] as const).map((program) => (
            <Pressable key={program} accessibilityRole="button"
              style={[styles.choice, programCode === program && styles.choiceActive]}
              onPress={() => setProgramCode(program)}>
              <Text style={[styles.choiceText, programCode === program && styles.choiceTextActive]}>
                {program === 'puppy' ? 'Puppy' : 'Comandos'}
              </Text>
            </Pressable>
          ))}
        </View>
        {programCode === 'comandos' ? (
          <>
            <Text style={styles.label}>Nivel Comandos</Text>
            <View style={styles.choiceRow}>
              {([['principiante','Básico'],['medio','Intermedio'],['avanzado','Avanzado']] as const).map(([value,label]) => (
                <Pressable key={value} accessibilityRole="button"
                  style={[styles.choice, level === value && styles.choiceActive]} onPress={() => setLevel(value)}>
                  <Text style={[styles.choiceText, level === value && styles.choiceTextActive]}>{label}</Text>
                </Pressable>
              ))}
            </View>
          </>
        ) : null}
        {programCode === 'puppy' ? (
          <>
            <Text style={styles.label}>Referencia de tarjeta Puppy (si se conoce)</Text>
            <TextInput style={styles.input} value={cardNumber} onChangeText={setCardNumber}
              maxLength={80} placeholder="Ej. P-0142" placeholderTextColor={ucapsaBrand.colors.muted} />
            <Text style={styles.label}>Inicio de tarjeta (solo si se conoce)</Text>
            <TextInput style={styles.input} value={cardStartedOn} onChangeText={setCardStartedOn}
              maxLength={10} placeholder="AAAA-MM-DD" placeholderTextColor={ucapsaBrand.colors.muted} />
          </>
        ) : null}
        <Text style={styles.helper}>Administración autoriza la inscripción. No se inventan pagos ni fechas históricas.</Text>
        <Text style={styles.label}>Asistencias históricas totales</Text>
        <TextInput style={styles.input} value={totalAttendances} onChangeText={setTotalAttendances}
          maxLength={3} keyboardType="number-pad" placeholder="2" placeholderTextColor={ucapsaBrand.colors.muted} />
        <Pressable style={styles.choiceLine} accessibilityRole="button"
          onPress={() => setIncludeDates((value) => !value)}>
          <MaterialIcons name={includeDates ? 'check-box' : 'check-box-outline-blank'}
            size={22} color={ucapsaBrand.colors.redDark} />
          <Text style={styles.choiceText}>Conozco algunas o todas las fechas</Text>
        </Pressable>
        {includeDates ? (
          <>
            <Text style={styles.label}>Fechas reales (una por línea o separadas por coma)</Text>
            <TextInput multiline numberOfLines={3} style={[styles.input,styles.multiline]}
              value={datesText} onChangeText={setDatesText}
              placeholder={'2026-10-04\n2026-10-11'} placeholderTextColor={ucapsaBrand.colors.muted} />
          </>
        ) : null}
        <Text style={styles.helper}>
          {unknownCount} asistencias quedan sin fecha conocida, conservando el total.
        </Text>
        <Text style={styles.label}>Origen o comentario (opcional)</Text>
        <TextInput style={styles.input} value={sourceNote} onChangeText={setSourceNote}
          maxLength={240} placeholder="Ej. Historial de tarjeta física revisada"
          placeholderTextColor={ucapsaBrand.colors.muted} />
      </View>

      <Pressable style={[styles.saveButton, saving && styles.disabled]} disabled={saving}
        accessibilityRole="button" onPress={() => void save()}>
        {saving ? <ActivityIndicator color={ucapsaBrand.colors.surface} /> :
          <MaterialIcons name="pets" size={20} color={ucapsaBrand.colors.surface} />}
        <Text style={styles.saveText}>{saving ? 'Guardando…' : 'Guardar preinscripción'}</Text>
      </Pressable>
      <Text style={styles.footer}>
        Guarda preinscripción y evidencia histórica. Las inscripciones definitivas se vinculan tras verificar la cuenta; no se generan pagos ficticios.
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
  choiceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  choice: { borderWidth: 1, borderColor: ucapsaBrand.colors.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9 },
  choiceActive: { backgroundColor: ucapsaBrand.colors.redDark, borderColor: ucapsaBrand.colors.redDark },
  choiceText: { color: ucapsaBrand.colors.text, fontWeight: '800', fontSize: 12 },
  choiceTextActive: { color: ucapsaBrand.colors.surface },
  choiceLine: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10 },
  multiline: { height: 84, textAlignVertical: 'top' },
  disabled: { opacity: 0.65 },
});
