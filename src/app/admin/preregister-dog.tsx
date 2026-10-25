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
import { preregistrationEnabled, preregistrationDirectoryEnabled } from '../../constants/preregistrationFeature';
import { normalizeContactPhone } from '../../utils/phone-contact';
import { devWarn } from '../../lib/client-diagnostics';
import { getAdminPreregistrationRecords } from '../../services/preregistration-admin.service';
import { useSession } from '../../hooks/useSession';
import {
  adminPreregisterDogWithProgram,
  adminPreviewPreregistrationOwnerLink,
  adminApprovePreregistrationOwnerLink,
  type ManualLinkPreview,
} from '../../services/dog-preregistration.service';

export default function AdminPreregisterDogScreen() {
  const { isAdmin } = useSession();
  const [ownerName, setOwnerName] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [ownerPhone, setOwnerPhone] = useState('');
  const [familyMembers, setFamilyMembers] = useState<FamilyMemberInput[]>([]);
  const [ownerNoticeMethod, setOwnerNoticeMethod] = useState<NoticeDeliveryMethod | null>(null);
  const [dogName, setDogName] = useState('');
  const [programCode, setProgramCode] = useState<'puppy'|'comandos'>('puppy');
  const [memberAuthorized, setMemberAuthorized] = useState(false);
  const [level, setLevel] = useState<'principiante'|'medio'|'avanzado'>('principiante');
  const [cardNumber, setCardNumber] = useState('');
  const [cardStartedOn, setCardStartedOn] = useState('');
  const [totalAttendances, setTotalAttendances] = useState('0');
  const [includeDates, setIncludeDates] = useState(false);
  const [datesText, setDatesText] = useState('');
  const [sourceNote, setSourceNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [submissionNotice, setSubmissionNotice] = useState<{kind:'success'|'error';message:string}|null>(null);
  const [linkContact, setLinkContact] = useState('');
  const [linkAccountEmail, setLinkAccountEmail] = useState('');
  const [linkReason, setLinkReason] = useState('');
  const [linkPreview, setLinkPreview] = useState<ManualLinkPreview | null>(null);
  const [linkBusy, setLinkBusy] = useState(false);
  const [linkNotice, setLinkNotice] = useState<{kind:'success'|'error';message:string}|null>(null);

  function reportLinkNotice(kind: 'success' | 'error', title: string, message: string) {
    if (Platform.OS === 'web') setLinkNotice({ kind, message: title + ': ' + message });
    else Alert.alert(title, message);
  }

  async function previewManualLink() {
    if (linkBusy) return;
    setLinkPreview(null);
    setLinkNotice(null);
    try {
      setLinkBusy(true);
      const found = await adminPreviewPreregistrationOwnerLink(linkContact, linkAccountEmail);
      if (found.status !== 'available') {
        reportLinkNotice('error', 'No se encontró una vinculación única',
          found.status === 'account_not_found' ? 'No hay una cuenta registrada con ese correo.' :
          found.status === 'conflict' ? 'Hay coincidencias ambiguas: revisa los datos con la persona.' :
          'No existe una preinscripción pendiente para ese contacto.');
        return;
      }
      setLinkPreview(found);
    } catch (error) {
      devWarn('admin-preregister-dog: preview assisted link failed.', error);
      reportLinkNotice('error', 'No se pudo revisar',
        error instanceof Error ? error.message : 'Inténtalo de nuevo.');
    } finally {
      setLinkBusy(false);
    }
  }

  function confirmManualLink() {
    const selected = linkPreview;
    if (!selected?.personId || !selected.userId || linkBusy) return;
    const personId = selected.personId;
    const userId = selected.userId;
    const evidence = linkReason.trim();
    setLinkNotice(null);
    if (linkReason.trim().length < 12) {
      reportLinkNotice('error', 'Falta evidencia',
        'Describe cómo comprobaste la identidad del tutor (mínimo 12 caracteres).');
      return;
    }

    const message = '¿Comprobaste que ' + selected.ownerName +
      ' es el titular de la cuenta ' + (selected.accountName || selected.accountEmail) +
      '?\n\nSe autorizará ' + selected.dogCount +
      ' perro(s). El cliente todavía deberá aceptar desde su perfil.';

    async function approve() {
      try {
        setLinkBusy(true);
        await adminApprovePreregistrationOwnerLink(personId, userId, evidence);
        setLinkPreview(null);
        setLinkReason('');
        reportLinkNotice('success', 'Autorización guardada',
          'Indica al titular que abra Mi perfil → Ajustes → Buscar mis preinscripciones y pulse «Sí, vincular expedientes». No necesita verificar correo ni SMS.');
      } catch (error) {
        devWarn('admin-preregister-dog: assisted link approval failed.', error);
        reportLinkNotice('error', 'No se pudo autorizar',
          error instanceof Error ? error.message : 'Revisa el expediente.');
      } finally {
        setLinkBusy(false);
      }
    }

    // Browser confirmation must work without React Native Alert.
    if (Platform.OS === 'web') {
      if (window.confirm(message)) void approve();
      return;
    }
    Alert.alert('Confirmar vinculación asistida', message, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Sí, autorizar', onPress: () => { void approve(); } },
    ]);
  }

  function clearCardForm() {
    setOwnerName(''); setOwnerEmail(''); setOwnerPhone('');
    setFamilyMembers([]);
    setOwnerNoticeMethod(null);
    setDogName(''); setProgramCode('puppy'); setLevel('principiante');
    setMemberAuthorized(false);
    setCardNumber(''); setCardStartedOn(''); setTotalAttendances('0');
    setIncludeDates(false); setDatesText(''); setSourceNote('');
  }

  function reportCardError(title: string, message: string) {
    if (Platform.OS === 'web') setSubmissionNotice({ kind: 'error', message });
    else Alert.alert(title, message);
  }

  async function confirmHistoryCorrection(dog: string, program: string, attendances: number): Promise<boolean> {
    const message = `Ya existe una preinscripción pendiente de ${dog} en ${program}, con ${attendances} asistencias reconocidas. Continuar reemplazará la evidencia provisional de esa tarjeta; la versión anterior se conservará en auditoría. ¿Confirmas la corrección?`;
    if (Platform.OS === 'web') return window.confirm(message);
    return new Promise<boolean>((resolve) => {
      Alert.alert('Corregir tarjeta existente', message, [
        { text: 'Cancelar', style: 'cancel', onPress: () => resolve(false) },
        { text: 'Sí, corregir', onPress: () => resolve(true) },
      ], { cancelable: false });
    });
  }

  async function save() {
    if (saving) return;
    setSubmissionNotice(null);
    if (!ownerName.trim() || !dogName.trim() || (!ownerPhone.trim() && !ownerEmail.trim())) {
      reportCardError('Faltan datos', 'Escribe tutor, perro y celular o correo de contacto. Prioriza el celular.');
      return;
    }
    if (ownerEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerEmail.trim())) {
      reportCardError('Correo inválido', 'Escribe un correo electrónico válido para vincular la cuenta.');
      return;
    }
    if (ownerPhone.trim()) {
      try { normalizeContactPhone(ownerPhone); }
      catch (error) {
        const message = error instanceof Error ? error.message : 'Revisa el celular.';
        if (Platform.OS === 'web') setSubmissionNotice({ kind: 'error', message });
        else Alert.alert('Celular inválido', message);
        return;
      }
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
      // La RPC del servidor hace upsert y conserva un snapshot auditado,
      // pero una recaptura puede REEMPLAZAR evidencia: nunca sobrescribir sin
      // mostrar el expediente y exigir confirmación/motivo de la corrección.
      if (!preregistrationDirectoryEnabled) {
        throw new Error('No puedo comprobar duplicados porque el directorio de preinscripciones está deshabilitado.');
      }
      const existingRecords = await getAdminPreregistrationRecords();
      const emailKey = ownerEmail.trim().toLowerCase();
      const phoneKey = ownerPhone.trim() ? normalizeContactPhone(ownerPhone) : '';
      const sameDogProgram = existingRecords.filter((record) =>
        record.dogName.trim().toLowerCase() === dogName.trim().toLowerCase()
        && record.programCode === programCode
        && ((emailKey && record.ownerEmail?.trim().toLowerCase() === emailKey)
          || (phoneKey && record.ownerPhone === phoneKey))
      );
      if (sameDogProgram.length > 1) {
        throw new Error('Encontré varios expedientes para esta tarjeta. Abre Preinscripciones y resuelve la coincidencia antes de modificar historial.');
      }
      if (sameDogProgram.length === 1) {
        const existing = sameDogProgram[0];
        if (existing.status !== 'pending') {
          throw new Error('El expediente ya está vinculado. Edita el historial oficial desde la ficha correspondiente.');
        }
        if (sourceNote.trim().length < 12) {
          throw new Error('Esta tarjeta ya existe. Para corregirla, escribe el motivo en Observaciones (mínimo 12 caracteres) y guarda nuevamente.');
        }
        const confirmed = await confirmHistoryCorrection(existing.dogName,
          existing.programCode === 'puppy' ? 'Puppy' : 'Comandos', existing.attendancesCount);
        if (!confirmed) return;
      }
      if (!ownerNoticeMethod) throw new Error('Confirma cómo entregaste el aviso de privacidad al titular.');
      await adminPreregisterDogWithProgram({
        ownerName, ownerEmail: ownerEmail.trim().toLowerCase(), ownerPhone, dogName,
        programCode, programLevel: programCode === 'puppy' ? 'base' : level,
        physicalCardNumber: programCode === 'puppy' ? cardNumber : '',
        cardStartedOn: programCode === 'puppy' ? (cardStartedOn.trim() || null) : null,
        totalAttendances: count, knownAttendanceDates: dates, sourceNote,
        memberAuthorized, familyMembers, ownerNoticeDeliveryMethod: ownerNoticeMethod,
      });
      const savedMessage = memberAuthorized
        ? 'Preinscripción y autorización de Socio guardadas. La membresía se activará cuando se vincule la cuenta.'
        : 'El perro quedó preinscrito y podrá vincularse a la cuenta del titular.';
      const familyNotice = familyMembers.length ? ' Familia registrada: ' + familyMembers.length + ' integrante(s), sin acceso automático.' : '';
      if (Platform.OS === 'web') {
        clearCardForm();
        setSubmissionNotice({ kind: 'success', message: savedMessage + familyNotice + ' Puedes registrar otra tarjeta.' });
      } else {
        Alert.alert('Perro preinscrito', savedMessage + familyNotice, [
          { text: 'Otro registro', onPress: clearCardForm },
          { text: 'Finalizar', onPress: () => router.back() },
        ]);
      }
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Revisa la información e inténtalo nuevamente.';
      if (Platform.OS === 'web') setSubmissionNotice({ kind: 'error', message });
      else Alert.alert('No se pudo preinscribir', message);
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
      {submissionNotice ? (
        <View style={styles.noticeBox}>
          <Text accessibilityRole={submissionNotice.kind === 'error' ? 'alert' : 'text'}
            style={[styles.helper, { color: submissionNotice.kind === 'error' ? ucapsaBrand.colors.danger : ucapsaBrand.colors.greenDark }]}>
            {submissionNotice.message}
          </Text>
        </View>
      ) : null}
      <Text style={styles.description}>
        Registra al titular y su perro. Revisa el correo o celular cuidadosamente:
        la primera vinculación se realiza con los datos del titular.
      </Text>

      <View style={styles.card}>
        <Text style={styles.label}>Nombre del tutor</Text>
        <TextInput style={styles.input} value={ownerName} onChangeText={setOwnerName}
          autoCapitalize="words" autoCorrect={false} maxLength={120}
          placeholder="Nombre del tutor" placeholderTextColor={ucapsaBrand.colors.muted} />

        <Text style={styles.label}>Correo del tutor (opcional, recomendado)</Text>
        <TextInput style={styles.input} value={ownerEmail} onChangeText={setOwnerEmail}
          autoCapitalize="none" keyboardType="email-address" autoCorrect={false}
          maxLength={254} placeholder="correo@ejemplo.com"
          placeholderTextColor={ucapsaBrand.colors.muted} />

        <Text style={styles.label}>Celular del tutor (principal)</Text>
        <TextInput style={styles.input} value={ownerPhone} onChangeText={setOwnerPhone}
          keyboardType="phone-pad" maxLength={16} placeholder="5535100214 o +525535100214"
          placeholderTextColor={ucapsaBrand.colors.muted} />
        <Text style={styles.helper}>Puedes escribir diez dígitos o el número con +52. Comprueba que sea el contacto correcto del titular.</Text>

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
        <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: memberAuthorized }}
          onPress={() => setMemberAuthorized((value) => !value)} style={styles.choiceLine}>
          <MaterialIcons name={memberAuthorized ? 'check-box' : 'check-box-outline-blank'}
            size={23} color={ucapsaBrand.colors.greenDark} />
          <Text style={styles.choiceText}>Autorizar también como Socio (clases ilimitadas)</Text>
        </Pressable>
        <Text style={styles.helper}>
          {memberAuthorized
            ? 'Administración autoriza la membresía. Se vuelve oficial al vincular la cuenta, conservando el nivel y el historial. No se registra ningún pago.'
            : 'La inscripción se autoriza sin membresía. Puedes marcar Socio si corresponde.'}
        </Text>
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

      <PreregistrationFamilyEditor value={familyMembers} onChange={setFamilyMembers} disabled={saving} />
      <PreregistrationPrivacyNotice />
      <NoticeDeliverySelector value={ownerNoticeMethod} onChange={setOwnerNoticeMethod}
        disabled={saving} label="Entrega del aviso al titular" />

      <Pressable style={[styles.saveButton, saving && styles.disabled]} disabled={saving}
        accessibilityRole="button" onPress={() => void save()}>
        {saving ? <ActivityIndicator color={ucapsaBrand.colors.surface} /> :
          <MaterialIcons name="pets" size={20} color={ucapsaBrand.colors.surface} />}
        <Text style={styles.saveText}>{saving ? 'Guardando…' : 'Guardar preinscripción'}</Text>
      </Pressable>
      <View style={styles.card}>
        <Text style={styles.heading}>Vinculación asistida</Text>
        {linkNotice ? (
          <View style={styles.noticeBox}>
            <Text accessibilityRole={linkNotice.kind === 'error' ? 'alert' : 'text'}
              style={[styles.helper, { color: linkNotice.kind === 'error'
                ? ucapsaBrand.colors.danger : ucapsaBrand.colors.greenDark }]}>
              {linkNotice.message}
            </Text>
          </View>
        ) : null}
        <Text style={styles.description}>
          Comprueba presencialmente la identidad del tutor antes de autorizar la vinculación.
          Los familiares registrados no reciben acceso a cuentas por este procedimiento.
        </Text>
        <Text style={styles.label}>Teléfono o correo de la preinscripción</Text>
        <TextInput style={styles.input} value={linkContact}
          onChangeText={(value) => { setLinkContact(value); setLinkPreview(null); }}
          autoCapitalize="none" autoCorrect={false} maxLength={254}
          placeholder="+525512345678 o correo preinscrito"
          placeholderTextColor={ucapsaBrand.colors.muted} />
        <Text style={styles.label}>Correo de acceso de la cuenta existente</Text>
        <TextInput style={styles.input} value={linkAccountEmail}
          onChangeText={(value) => { setLinkAccountEmail(value); setLinkPreview(null); }}
          autoCapitalize="none" keyboardType="email-address" autoCorrect={false}
          maxLength={254} placeholder="cuenta@ejemplo.com"
          placeholderTextColor={ucapsaBrand.colors.muted} />
        <Pressable style={[styles.saveButton, { marginTop: 14 }, linkBusy && styles.disabled]}
          accessibilityRole="button" disabled={linkBusy}
          onPress={() => void previewManualLink()}>
          <Text style={styles.saveText}>{linkBusy ? 'Revisando…' : 'Revisar cuentas y expedientes'}</Text>
        </Pressable>
        {linkPreview?.status === 'available' ? (
          <View>
            <Text style={styles.label}>Titular preinscrito: {linkPreview.ownerName}</Text>
            <Text style={styles.label}>Cuenta: {linkPreview.accountName || 'Sin nombre'} ({linkPreview.accountEmail})</Text>
            <Text style={styles.helper}>Perros pendientes: {linkPreview.dogCount}. Confirma estos datos con la persona antes de autorizar.</Text>
            <Text style={styles.label}>¿Cómo comprobaste la identidad?</Text>
            <TextInput style={[styles.input,styles.multiline]} multiline
              value={linkReason} onChangeText={setLinkReason} maxLength={400}
              placeholder="Ej. Tutor presente con su tarjeta física y expediente"
              placeholderTextColor={ucapsaBrand.colors.muted} />
            <Pressable style={[styles.saveButton, { marginTop: 14 }, linkBusy && styles.disabled]}
              accessibilityRole="button" disabled={linkBusy}
              onPress={confirmManualLink}>
              <Text style={styles.saveText}>Autorizar vinculación a esta cuenta</Text>
            </Pressable>
          </View>
        ) : null}
      </View>
      <Text style={styles.footer}>
        La autorización administrativa conserva Puppy, Comandos y las asistencias históricas.
        La vinculación definitiva requiere aceptación del titular; nunca genera pagos ficticios.
      </Text>
    </KeyboardAwareScreen>
  );
}

const styles = StyleSheet.create({
  noticeBox: { borderWidth: 1, borderColor: ucapsaBrand.colors.border, borderRadius: 12, padding: 10, marginVertical: 10 },
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
