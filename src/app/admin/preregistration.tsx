import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Redirect, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';

import { KeyboardAwareScreen } from '../../components/ui/KeyboardAwareScreen';
import { PreregistrationFamilyEditor } from '../../components/domain/PreregistrationFamilyEditor';
import { previewAdminFamilyAccount,authorizeAdminFamilyAccount,revokeAdminFamilyAccount,
  type FamilyAccountPreview } from '../../services/family-account-links.service';
import { getAdminPreregisteredFamily, addAdminPreregisteredFamily,
  type FamilyMemberInput, type FamilyMemberSaved } from '../../services/preregistration-family.service';
import { ucapsaBrand } from '../../constants/brand';
import { preregistrationDirectoryEnabled } from '../../constants/preregistrationFeature';
import { useSession } from '../../hooks/useSession';
import { devWarn } from '../../lib/client-diagnostics';
import { normalizeContactPhone } from '../../utils/phone-contact';
import {
  adminCompletePreregistrationContact,
  getAdminPreregistrationRecords,
  adminSetPreregisteredMembership,
  preregistrationLevelLabel,
  preregistrationMemberLabel,
  type AdminPreregistrationRecord,
} from '../../services/preregistration-admin.service';

function Detail({ label, value }: { label: string; value: string }) {
  return <View style={styles.detail}>
    <Text style={styles.label}>{label}</Text>
    <Text style={styles.value} selectable>{value}</Text>
  </View>;
}

export default function AdminPreregistrationDetailScreen() {
  const { isAdmin } = useSession();
  const { intakeProgramId } = useLocalSearchParams<{ intakeProgramId?: string }>();
  const recordId = typeof intakeProgramId === 'string' ? intakeProgramId : '';
  const [record, setRecord] = useState<AdminPreregistrationRecord | null>(null);
  const [family, setFamily] = useState<FamilyMemberSaved[]>([]);
  const [newFamily, setNewFamily] = useState<FamilyMemberInput[]>([]);
  const [savingFamily, setSavingFamily] = useState(false);
  const [linkMemberId, setLinkMemberId] = useState<string | null>(null);
  const [accountPreview, setAccountPreview] = useState<FamilyAccountPreview | null>(null);
  const [linkEvidence, setLinkEvidence] = useState('');
  const [linkFamilyBusy, setLinkFamilyBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savingMember, setSavingMember] = useState(false);
  const [editingContact, setEditingContact] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [savingContact, setSavingContact] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'error'; title: string; message: string } | null>(null);

  function showFeedback(title: string, message: string, kind: 'success' | 'error' = 'error') {
    if (Platform.OS === 'web') setFeedback({ kind, title, message });
    else Alert.alert(title, message);
  }

  const load = useCallback(async () => {
    try {
      setError(null);
      const [rows, members] = await Promise.all([
        getAdminPreregistrationRecords(recordId), getAdminPreregisteredFamily(recordId),
      ]);
      setRecord(rows[0] ?? null);
      setFamily(members);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No fue posible abrir el expediente.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [recordId]);

  useFocusEffect(useCallback(() => {
    if (!isAdmin || !preregistrationDirectoryEnabled || !recordId) return;
    setLoading(true);
    void load();
  }, [isAdmin, recordId, load]));

  async function saveMissingContact() {
    if (!record || savingContact || record.status !== 'pending') return;
    setFeedback(null);
    const email = record.ownerEmail ? '' : newEmail.trim().toLowerCase();
    let phone = record.ownerPhone ? '' : newPhone.trim();
    if (!email && !phone) {
      showFeedback('Falta un dato', 'Escribe al menos un contacto que todavía no esté registrado.');
      return;
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      showFeedback('Correo inválido', 'Revisa el formato del correo electrónico.');
      return;
    }
    if (phone) {
      try { phone = normalizeContactPhone(phone); }
      catch (cause) {
        devWarn('admin-preregistration: invalid contact phone format.', cause);
        showFeedback('Celular inválido', cause instanceof Error ? cause.message
          : 'Usa diez dígitos mexicanos o formato internacional +52.');
        return;
      }
    }
    try {
      setSavingContact(true);
      await adminCompletePreregistrationContact(record.personId, { email, phone });
      await load();
      setEditingContact(false);
      setNewEmail('');
      setNewPhone('');
      showFeedback('Contacto completado', 'El expediente ya tiene el nuevo dato. La vinculación se evaluará al revisar la cuenta.', 'success');
    } catch (cause) {
      devWarn('admin-preregistration: could not complete missing contact.', cause);
      showFeedback('No se pudo guardar', cause instanceof Error ? cause.message : 'Revisa el dato y vuelve a intentar.');
    } finally {
      setSavingContact(false);
    }
  }

  async function changeMember(isMember:boolean) {
    if(!record || savingMember || record.status!=='pending') return;
    setFeedback(null);
    try {
      setSavingMember(true);
      await adminSetPreregisteredMembership(record.intakeDogId,isMember);
      await load();
      showFeedback('Autorización actualizada',isMember
        ? 'Socio autorizado. La membresía oficial se creará al vincular la cuenta, sin generar pagos.'
        : 'Se retiró la autorización provisional de Socio.', 'success');
    } catch(cause) {
      devWarn('admin-preregistration: could not update provisional Socio authorization.', cause);
      showFeedback('No se pudo actualizar',cause instanceof Error
        ? cause.message:'Revisa el expediente.');
    } finally { setSavingMember(false); }
  }

  async function saveFamily() {
    if (!record || savingFamily || !newFamily.length) return;
    setFeedback(null);
    try {
      setSavingFamily(true);
      const added = await addAdminPreregisteredFamily(record.intakeProgramId, newFamily);
      await load();
      setNewFamily([]);
      showFeedback('Familia actualizada', added > 0
        ? 'Se añadieron ' + added + ' integrantes al expediente.'
        : 'Estas personas ya estaban registradas en la familia.', 'success');
    } catch (cause) {
      devWarn('admin-preregistration: could not add family.', cause);
      showFeedback('No se pudo guardar la familia',
        cause instanceof Error ? cause.message : 'Revisa los datos e inténtalo de nuevo.');
    } finally {
      setSavingFamily(false);
    }
  }

  async function previewFamilyAccount(id: string) {
    setLinkMemberId(id);
    setAccountPreview(null);
    setLinkEvidence('');
    setLinkFamilyBusy(true);
    try {
      setAccountPreview(await previewAdminFamilyAccount(id));
    } catch (cause) {
      devWarn('admin-preregistration: unable to check family account.', cause);
      showFeedback('No se pudo revisar', 'Revisa la conexión y vuelve a intentarlo.');
    } finally { setLinkFamilyBusy(false); }
  }

  async function changeFamilyAccount(revoke: boolean) {
    if (!linkMemberId || linkFamilyBusy || linkEvidence.trim().length < 12) {
      showFeedback('Falta comprobación', 'Explica cómo revisaste las identidades o por qué debes retirar el vínculo (mínimo 12 caracteres).');
      return;
    }
    setLinkFamilyBusy(true);
    try {
      if (revoke) await revokeAdminFamilyAccount(linkMemberId, linkEvidence);
      else await authorizeAdminFamilyAccount(linkMemberId, linkEvidence);
      setAccountPreview(null);
      setLinkMemberId(null);
      setLinkEvidence('');
      showFeedback(revoke ? 'Vinculación retirada' : 'Invitación familiar enviada',
        revoke ? 'Ambas cuentas dejaron de compartir su progreso.'
          : 'Las dos personas deben autorizar el acceso desde Perfil → Mi familia.', 'success');
    } catch (cause) {
      devWarn('admin-preregistration: could not manage family account.', cause);
      showFeedback('No se pudo actualizar la familia',
        cause instanceof Error ? cause.message : 'Revisa la información y vuelve a intentarlo.');
    } finally { setLinkFamilyBusy(false); }
  }

  if (!isAdmin || !preregistrationDirectoryEnabled) return <Redirect href="/home" />;

  return (
    <KeyboardAwareScreen refreshControl={<RefreshControl refreshing={refreshing} tintColor={ucapsaBrand.colors.red}
      onRefresh={() => { setRefreshing(true); void load(); }} />}>
      <Pressable accessibilityRole="button" style={styles.back} onPress={() => router.back()}>
        <MaterialIcons name="arrow-back" size={20} color={ucapsaBrand.colors.redDark} />
        <Text style={styles.backText}>Preinscripciones</Text>
      </Pressable>
      <Text style={styles.kicker}>Administración · Expediente</Text>
      <Text style={styles.heading}>{record?.dogName || 'Ficha de preinscripción'}</Text>
      {feedback ? (
        <View style={styles.feedbackBox}>
          <Text accessibilityRole={feedback.kind === 'error' ? 'alert' : 'text'}
            style={[styles.feedbackTitle, { color: feedback.kind === 'error' ? ucapsaBrand.colors.danger : ucapsaBrand.colors.greenDark }]}>
            {feedback.title}
          </Text>
          <Text style={styles.hint}>{feedback.message}</Text>
        </View>
      ) : null}
      {loading ? <ActivityIndicator style={styles.loading} color={ucapsaBrand.colors.red} /> : null}
      {error ? <View style={styles.card}><Text style={styles.warning}>{error}</Text>
        <Pressable accessibilityRole="button" onPress={() => { setLoading(true); void load(); }}>
          <Text style={styles.link}>Reintentar</Text>
        </Pressable>
      </View> : null}
      {!loading && !error && !record ? (
        <View style={styles.card}><Text style={styles.value}>Este expediente no existe o no está disponible.</Text></View>
      ) : null}
      {record && !loading ? (
        <>
          <View style={styles.card}>
            <Text style={styles.groupTitle}>Tutor y perro</Text>
            <Detail label="Tutor" value={record.ownerName} />
            <Detail label="Correo" value={record.ownerEmail || 'No registrado'} />
            <Detail label="Teléfono" value={record.ownerPhone || 'No registrado'} />
            <Detail label="Perro" value={record.dogName} />
            <Detail label="Cuenta" value={record.status === 'linked' ? 'Vinculada' : 'Pendiente de vinculación'} />
          </View>
          <View style={styles.card}>
            <Text style={styles.groupTitle}>Familia del titular</Text>
            {family.length ? family.map((member) => (
              <View key={member.id} style={styles.detail}>
                <Text style={styles.value}>{member.fullName}</Text>
                <Text style={styles.hint}>
                  {[member.phone, member.email].filter(Boolean).join(' · ') || 'Sin contacto adicional'}
                </Text>
                {record.status === 'linked' ? (
                  <Pressable accessibilityRole="button" style={styles.secondary}
                    disabled={linkFamilyBusy} onPress={() => { void previewFamilyAccount(member.id); }}>
                    <Text style={styles.secondaryText}>Revisar cuenta de {member.fullName}</Text>
                  </Pressable>
                ) : null}
              </View>
            )) : <Text style={styles.hint}>No hay otros integrantes registrados.</Text>}
            <Text style={styles.hint}>
              Este listado es provisional. No permite entrar a cuentas, utilizar la membresía
              ni consultar fotografías de otras personas.
            </Text>
            {linkMemberId && accountPreview ? (
              <View style={styles.card}>
                <Text style={styles.groupTitle}>Vincular familiar</Text>
                <Text style={styles.hint}>
                  {accountPreview.status === 'available'
                    ? 'Cuenta encontrada: ' + accountPreview.accountName +
                      '. Confirma personalmente la identidad de las dos personas.'
                    : accountPreview.status === 'already_requested'
                      ? 'Ya existe una invitación vinculada. Puedes retirarla si es incorrecta.'
                      : accountPreview.status === 'head_not_linked'
                        ? 'Primero el titular debe vincular su propia cuenta.'
                        : accountPreview.status === 'no_account'
                          ? 'El familiar todavía no tiene una cuenta coincidente.'
                          : 'Los contactos apuntan a varias cuentas o a la cuenta del titular. Revisa con Administración.'}
                </Text>
                {accountPreview.status === 'available' || accountPreview.status === 'already_requested' ? (
                  <>
                    <Text style={styles.fieldLabel}>Comprobación presencial o motivo de corrección</Text>
                    <TextInput multiline style={styles.input} maxLength={400}
                      value={linkEvidence} onChangeText={setLinkEvidence}
                      editable={!linkFamilyBusy} placeholder="Cómo comprobaste ambas identidades"
                      placeholderTextColor={ucapsaBrand.colors.muted} />
                    <Pressable accessibilityRole="button" disabled={linkFamilyBusy}
                      style={styles.primary} onPress={() => {
                        void changeFamilyAccount(accountPreview.status === 'already_requested');
                      }}>
                      <Text style={styles.primaryText}>{linkFamilyBusy ? 'Guardando…'
                        : accountPreview.status === 'already_requested'
                          ? 'Retirar vinculación' : 'Autorizar invitación familiar'}</Text>
                    </Pressable>
                  </>
                ) : null}
                <Pressable accessibilityRole="button" style={styles.cancel} onPress={() => {
                  setLinkMemberId(null); setAccountPreview(null); setLinkEvidence('');
                }}>
                  <Text style={styles.secondaryText}>Cerrar</Text>
                </Pressable>
              </View>
            ) : null}
          </View>
          <>
              <PreregistrationFamilyEditor value={newFamily} onChange={setNewFamily} disabled={savingFamily} />
              {newFamily.length > 0 ? (
                <Pressable accessibilityRole="button" style={styles.primary} disabled={savingFamily}
                  onPress={() => { void saveFamily(); }}>
                  {savingFamily ? <ActivityIndicator color={ucapsaBrand.colors.surface} /> :
                    <Text style={styles.primaryText}>Guardar nuevos integrantes</Text>}
                </Pressable>
              ) : null}
          </>
          {record.status === 'pending' && (!record.ownerEmail || !record.ownerPhone) ? (
            <View style={styles.card}>
              <Text style={styles.groupTitle}>Completar contacto faltante</Text>
              <Text style={styles.hint}>Solo puedes añadir datos que estén vacíos. Los contactos existentes no se sustituyen; tampoco se modifican asistencias, programas ni niveles.</Text>
              {!editingContact ? (
                <Pressable accessibilityRole="button" style={styles.secondary}
                  onPress={() => setEditingContact(true)}>
                  <MaterialIcons name="edit" size={18} color={ucapsaBrand.colors.redDark} />
                  <Text style={styles.secondaryText}>Completar contacto</Text>
                </Pressable>
              ) : (
                <>
                  {!record.ownerEmail ? (
                    <>
                      <Text style={styles.fieldLabel}>Correo electrónico (faltante)</Text>
                      <TextInput style={styles.input} value={newEmail} onChangeText={setNewEmail}
                        accessibilityLabel="Agregar correo del tutor" autoCapitalize="none"
                        autoCorrect={false} keyboardType="email-address" maxLength={254}
                        editable={!savingContact} placeholder="correo@ejemplo.com"
                        placeholderTextColor={ucapsaBrand.colors.muted} />
                    </>
                  ) : null}
                  {!record.ownerPhone ? (
                    <>
                      <Text style={styles.fieldLabel}>Celular (faltante)</Text>
                      <TextInput style={styles.input} value={newPhone} onChangeText={setNewPhone}
                        accessibilityLabel="Agregar celular del tutor" keyboardType="phone-pad"
                        maxLength={16} editable={!savingContact} placeholder="5535100214 o +525535100214"
                        placeholderTextColor={ucapsaBrand.colors.muted} />
                    </>
                  ) : null}
                  <Pressable accessibilityRole="button" style={styles.primary}
                    disabled={savingContact} onPress={() => { void saveMissingContact(); }}>
                    {savingContact ? <ActivityIndicator color={ucapsaBrand.colors.surface} /> :
                      <Text style={styles.primaryText}>Guardar contacto</Text>}
                  </Pressable>
                  <Pressable accessibilityRole="button" style={styles.cancel}
                    disabled={savingContact} onPress={() => {
                      setEditingContact(false); setNewEmail(''); setNewPhone('');
                    }}>
                    <Text style={styles.secondaryText}>Cancelar</Text>
                  </Pressable>
                </>
              )}
            </View>
          ) : null}
          <View style={styles.card}>
            <Text style={styles.groupTitle}>Programa y nivel</Text>
            <Detail label="Programa" value={record.programCode === 'puppy' ? 'Puppy' : 'Comandos'} />
            <Detail label="Etapa" value={preregistrationLevelLabel(record)} />
            <Detail label="Horario oficial" value={record.scheduleName + ' · ' + record.scheduleTime} />
            <Detail label="Autorizado desde" value={record.authorizedOn} />
            {record.programCode === 'puppy' ?
              <Detail label="Referencia física Puppy" value={record.physicalCardReference || 'No registrada'} /> : null}
            <Detail label="Membresía de Socio" value={preregistrationMemberLabel(record)} />
            {record.status === 'pending' ? (
              <Pressable accessibilityRole="button" disabled={savingMember}
                style={styles.secondary}
                onPress={() => void changeMember(record.membershipStatus !== 'preapproved')}>
                <MaterialIcons name={record.membershipStatus === 'preapproved'
                  ? 'person-remove' : 'verified-user'} size={18}
                  color={ucapsaBrand.colors.redDark} />
                <Text style={styles.secondaryText}>{savingMember ? 'Guardando…'
                  : record.membershipStatus === 'preapproved'
                    ? 'Retirar autorización de Socio' : 'Autorizar como Socio'}</Text>
              </Pressable>
            ) : null}
            <Text style={styles.hint}>La primera vinculación utiliza los datos del titular. Los familiares no se vinculan por aparecer en este expediente.</Text>
          </View>
          <View style={styles.card}>
            <Text style={styles.groupTitle}>Asistencias reconocidas</Text>
            <Detail label="Total" value={String(record.attendancesCount)} />
            <Detail label="Con fecha" value={String(record.datedAttendances)} />
            <Detail label="Sin fecha conocida" value={String(record.undatedAttendances)} />
            <Text style={styles.hint}>Se muestran asistencias documentadas en este expediente; no se generan registros ficticios.</Text>
          </View>
          {record.linkedUserId ? (
            <Pressable accessibilityRole="button" style={styles.primary}
              onPress={() => router.push(('/admin/customer?userId=' + encodeURIComponent(record.linkedUserId!)) as never)}>
              <MaterialIcons name="person" size={20} color={ucapsaBrand.colors.surface} />
              <Text style={styles.primaryText}>Abrir ficha oficial del cliente</Text>
            </Pressable>
          ) : (
            <Text style={styles.hint}>La membresía y los accesos se administran cuando el titular vincule su cuenta.</Text>
          )}
        </>
      ) : null}
    </KeyboardAwareScreen>
  );
}

const styles = StyleSheet.create({
  back: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 14 },
  backText: { color: ucapsaBrand.colors.redDark, fontSize: 13, fontWeight: '800' },
  kicker: { color: ucapsaBrand.colors.redDark, fontSize: 11, fontWeight: '900' },
  heading: { color: ucapsaBrand.colors.text, fontSize: 27, fontWeight: '900', marginTop: 5, marginBottom: 15 },
  loading: { marginTop: 20 },
  feedbackBox: { padding: 14, borderWidth: 1, borderColor: ucapsaBrand.colors.border,
    backgroundColor: ucapsaBrand.colors.surface, borderRadius: 12, marginBottom: 12 },
  feedbackTitle: { fontWeight: '900', fontSize: 13 },
  card: { backgroundColor: ucapsaBrand.colors.surface, borderWidth: 1, borderColor: ucapsaBrand.colors.border,
    borderRadius: 17, padding: 16, marginBottom: 12 },
  groupTitle: { color: ucapsaBrand.colors.text, fontWeight: '900', fontSize: 16, marginBottom: 6 },
  detail: { paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: ucapsaBrand.colors.border },
  label: { color: ucapsaBrand.colors.muted, fontSize: 11, fontWeight: '800' },
  value: { color: ucapsaBrand.colors.text, fontSize: 14, fontWeight: '700', marginTop: 4 },
  warning: { color: ucapsaBrand.colors.danger, fontSize: 12 },
  link: { color: ucapsaBrand.colors.redDark, fontWeight: '900', fontSize: 13, paddingVertical: 8 },
  hint: { color: ucapsaBrand.colors.muted, fontSize: 12, lineHeight: 17, marginTop: 10 },
  primary: { backgroundColor: ucapsaBrand.colors.greenDark, borderRadius: 13, minHeight: 52,
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8 },
  primaryText: { color: ucapsaBrand.colors.surface, fontWeight: '900', fontSize: 13 },
  secondary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderRadius: 12, borderWidth: 1, borderColor: ucapsaBrand.colors.border,
    padding: 12, marginTop: 12 },
  secondaryText: { color: ucapsaBrand.colors.redDark, fontSize: 13, fontWeight: '800' },
  fieldLabel: { color: ucapsaBrand.colors.text, fontWeight: '700', fontSize: 13, marginTop: 15, marginBottom: 7 },
  input: { borderWidth: 1, borderColor: ucapsaBrand.colors.border, borderRadius: 12,
    backgroundColor: ucapsaBrand.colors.background, minHeight: 48, paddingHorizontal: 12,
    color: ucapsaBrand.colors.text, fontSize: 14, marginBottom: 9 },
  cancel: { alignItems: 'center', padding: 12 },
});
