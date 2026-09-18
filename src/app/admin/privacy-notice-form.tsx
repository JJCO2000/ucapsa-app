import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { KeyboardAwareScreen } from '../../components/ui/KeyboardAwareScreen';
import { ucapsaBrand } from '../../constants/brand';
import { useSession } from '../../hooks/useSession';
import {
  getPrivacyNoticeAdminById,
  publishPrivacyNotice,
  savePrivacyNoticeDraft,
  type PrivacyNoticeDraftInput,
} from '../../services/privacy-notice.service';

type DraftForm = Omit<PrivacyNoticeDraftInput, 'id' | 'effectiveFrom'>;

type FieldKey = Exclude<keyof DraftForm, 'version'>;

const fieldSpecs: Array<{ key: FieldKey; label: string; hint: string; multiline?: boolean }> = [
  { key: 'responsibleName', label: 'Nombre o denominación del responsable', hint: 'Dato jurídico real del responsable del tratamiento.' },
  { key: 'responsibleAddress', label: 'Domicilio del responsable', hint: 'Domicilio real que corresponda al responsable.' },
  { key: 'contactEmail', label: 'Contacto de privacidad', hint: 'Correo real para privacidad / derechos ARCO.' },
  { key: 'dataCategories', label: 'Datos personales tratados', hint: 'Describe las categorías realmente recabadas por UCAPSA.', multiline: true },
  { key: 'sensitiveDataCategories', label: 'Datos personales sensibles', hint: 'Indica los sensibles realmente tratados; si no existen, declara expresamente esa condición con revisión jurídica.', multiline: true },
  { key: 'purposes', label: 'Finalidades del tratamiento', hint: 'Finalidades reales, concretas y verificables.', multiline: true },
  { key: 'consentRequiredPurposes', label: 'Finalidades que requieren consentimiento', hint: 'Separa las finalidades cuyo consentimiento deba obtenerse.', multiline: true },
  { key: 'limitationMechanisms', label: 'Limitación de uso o divulgación', hint: 'Mecanismos disponibles para limitar uso o divulgación.', multiline: true },
  { key: 'arcoProcedure', label: 'Procedimiento para derechos ARCO', hint: 'Medios, requisitos y procedimiento real para ejercer derechos.', multiline: true },
  { key: 'transferClause', label: 'Transferencias', hint: 'Transferencias reales y, cuando corresponda, cláusula de aceptación.', multiline: true },
  { key: 'changeNoticeMethod', label: 'Cambios al aviso', hint: 'Medio real por el que se comunicarán cambios.', multiline: true },
  { key: 'simplifiedNotice', label: 'Aviso simplificado', hint: 'Texto que podrá mostrarse al recabar datos electrónicamente.', multiline: true },
  { key: 'integralNotice', label: 'Aviso integral', hint: 'Texto integral final aprobado para publicación.', multiline: true },
];

function emptyForm(): DraftForm {
  return {
    version: '',
    responsibleName: '',
    responsibleAddress: '',
    contactEmail: '',
    dataCategories: '',
    sensitiveDataCategories: '',
    purposes: '',
    consentRequiredPurposes: '',
    limitationMechanisms: '',
    arcoProcedure: '',
    changeNoticeMethod: '',
    transferClause: '',
    simplifiedNotice: '',
    integralNotice: '',
  };
}

function fromNotice(row: NonNullable<Awaited<ReturnType<typeof getPrivacyNoticeAdminById>>>): DraftForm {
  return {
    version: row.version ?? '',
    responsibleName: row.responsible_name ?? '',
    responsibleAddress: row.responsible_address ?? '',
    contactEmail: row.contact_email ?? '',
    dataCategories: row.data_categories ?? '',
    sensitiveDataCategories: row.sensitive_data_categories ?? '',
    purposes: row.purposes ?? '',
    consentRequiredPurposes: row.consent_required_purposes ?? '',
    limitationMechanisms: row.limitation_mechanisms ?? '',
    arcoProcedure: row.arco_procedure ?? '',
    changeNoticeMethod: row.change_notice_method ?? '',
    transferClause: row.transfer_clause ?? '',
    simplifiedNotice: row.simplified_notice ?? '',
    integralNotice: row.integral_notice ?? '',
  };
}

export default function PrivacyNoticeFormScreen() {
  const { role } = useSession();
  const isSuperAdmin = role === 'super_admin';
  const params = useLocalSearchParams<{ id?: string }>();
  const id = typeof params.id === 'string' ? params.id : null;

  const [form, setForm] = useState<DraftForm>(() => emptyForm());
  const [status, setStatus] = useState<string>('draft');
  const [loading, setLoading] = useState(Boolean(id));
  const [saving, setSaving] = useState(false);
  const [currentId, setCurrentId] = useState<string | null>(id);

  useEffect(() => {
    if (!isSuperAdmin || !id) return;
    let active = true;
    setLoading(true);
    void getPrivacyNoticeAdminById(id)
      .then((row) => {
        if (!active) return;
        if (!row) {
          Alert.alert('Aviso no encontrado', 'La versión ya no existe.');
          router.replace('/admin/privacy-notices' as never);
          return;
        }
        setForm(fromNotice(row));
        setStatus(row.status);
        setCurrentId(row.id);
      })
      .catch((cause) => {
        if (active) Alert.alert('No se pudo cargar', cause instanceof Error ? cause.message : 'Intenta de nuevo.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [id, isSuperAdmin]);

  const missing = useMemo(() => {
    const result: string[] = [];
    if (!form.version.trim()) result.push('Versión');
    for (const spec of fieldSpecs) {
      if (!form[spec.key].trim()) result.push(spec.label);
    }
    return result;
  }, [form]);

  if (!isSuperAdmin) return <Redirect href="/admin/tools-administration" />;

  const immutable = status === 'published' || status === 'retired';

  function update(key: keyof DraftForm, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function save() {
    if (!form.version.trim()) {
      Alert.alert('Falta versión', 'Asigna un identificador claro a esta versión.');
      return null;
    }

    try {
      setSaving(true);
      const saved = await savePrivacyNoticeDraft({
        id: currentId,
        ...form,
        effectiveFrom: null,
      });
      setCurrentId(saved.id);
      setStatus(saved.status);
      Alert.alert('Borrador guardado', 'Los cambios quedaron guardados sin publicar.');
      return saved;
    } catch (cause) {
      Alert.alert('No se pudo guardar', cause instanceof Error ? cause.message : 'Intenta de nuevo.');
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function publish() {
    if (missing.length > 0) {
      Alert.alert('Aviso incompleto', `Faltan ${missing.length} campo(s) obligatorio(s). Completa y revisa antes de publicar.`);
      return;
    }

    let targetId = currentId;
    if (!targetId) {
      const saved = await save();
      targetId = saved?.id ?? null;
      if (!targetId) return;
    }

    Alert.alert(
      'Publicar aviso',
      'La versión publicada quedará inmutable. Confirma sólo si el contenido jurídico fue revisado y aprobado.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Publicar',
          onPress: async () => {
            try {
              setSaving(true);
              await publishPrivacyNotice(targetId as string);
              Alert.alert('Aviso publicado', 'La versión ya es la fuente pública canónica.');
              router.replace('/admin/privacy-notices' as never);
            } catch (cause) {
              Alert.alert('No se pudo publicar', cause instanceof Error ? cause.message : 'Intenta de nuevo.');
            } finally {
              setSaving(false);
            }
          },
        },
      ],
    );
  }

  return (
    <KeyboardAwareScreen>
      <View style={styles.hero}>
        <View style={{ flex: 1 }}>
          <Text style={styles.kicker}>Superadmin · Privacidad</Text>
          <Text style={styles.title}>{currentId ? `Versión ${form.version || 'sin nombre'}` : 'Nueva versión'}</Text>
          <Text style={styles.subtitle}>
            {immutable
              ? 'Esta versión es histórica y no se edita. Crea una nueva versión para cualquier cambio.'
              : 'Guarda como borrador. La app no rellenará ni inventará contenido jurídico.'}
          </Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Cerrar" style={styles.close} onPress={() => router.back()}>
          <MaterialIcons name="close" size={22} color={ucapsaBrand.colors.redDark} />
        </Pressable>
      </View>

      {loading ? <Text style={styles.muted}>Cargando...</Text> : null}

      {!loading ? (
        <>
          <View style={missing.length === 0 ? styles.okBox : styles.warningBox}>
            <MaterialIcons name={missing.length === 0 ? 'check-circle-outline' : 'warning-amber'} size={20} color={missing.length === 0 ? ucapsaBrand.colors.greenDark : ucapsaBrand.colors.redDark} />
            <Text style={styles.boxText}>
              {missing.length === 0
                ? immutable
                  ? 'Versión completa.'
                  : 'Todos los campos mínimos están completos. La publicación sigue requiriendo revisión humana.'
                : `${missing.length} campo(s) obligatorio(s) pendiente(s). No se podrá publicar.`}
            </Text>
          </View>

          <Text style={styles.label}>Versión</Text>
          <TextInput
            value={form.version}
            onChangeText={(value) => update('version', value)}
            placeholder="Ej. 2026-01"
            editable={!immutable}
            style={[styles.input, immutable && styles.readonly]}
          />

          {fieldSpecs.map((spec) => (
            <View key={spec.key}>
              <Text style={styles.label}>{spec.label}</Text>
              <Text style={styles.hint}>{spec.hint}</Text>
              <TextInput
                value={form[spec.key]}
                onChangeText={(value) => update(spec.key, value)}
                editable={!immutable}
                multiline={spec.multiline}
                textAlignVertical={spec.multiline ? 'top' : 'center'}
                autoCapitalize={spec.key === 'contactEmail' ? 'none' : 'sentences'}
                keyboardType={spec.key === 'contactEmail' ? 'email-address' : 'default'}
                style={[styles.input, spec.multiline && styles.textArea, immutable && styles.readonly]}
              />
            </View>
          ))}

          {!immutable ? (
            <View style={styles.actions}>
              <Pressable disabled={saving} style={[styles.secondary, saving && styles.disabled]} onPress={() => void save()}>
                <Text style={styles.secondaryText}>{saving ? 'Guardando...' : 'Guardar borrador'}</Text>
              </Pressable>
              <Pressable disabled={saving || missing.length > 0} style={[styles.primary, (saving || missing.length > 0) && styles.disabled]} onPress={() => void publish()}>
                <Text style={styles.primaryText}>Publicar versión</Text>
              </Pressable>
            </View>
          ) : null}
        </>
      ) : null}
    </KeyboardAwareScreen>
  );
}

const styles = StyleSheet.create({
  hero: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  kicker: { color: ucapsaBrand.colors.redDark, fontSize: 11, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.7 },
  title: { color: ucapsaBrand.colors.text, fontSize: 26, fontWeight: '900' },
  subtitle: { color: ucapsaBrand.colors.muted, fontSize: 12, lineHeight: 18, fontWeight: '700', marginTop: 3 },
  close: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: ucapsaBrand.colors.redSoft },
  muted: { color: ucapsaBrand.colors.muted, fontSize: 12, lineHeight: 18, fontWeight: '700' },
  warningBox: { flexDirection: 'row', gap: 9, borderRadius: 16, borderWidth: 1, borderColor: ucapsaBrand.colors.redBorder, backgroundColor: ucapsaBrand.colors.redSoft, padding: 12, marginBottom: 14 },
  okBox: { flexDirection: 'row', gap: 9, borderRadius: 16, borderWidth: 1, borderColor: ucapsaBrand.colors.greenSoft, backgroundColor: ucapsaBrand.colors.surface, padding: 12, marginBottom: 14 },
  boxText: { flex: 1, color: ucapsaBrand.colors.text, fontSize: 11, lineHeight: 17, fontWeight: '700' },
  label: { color: ucapsaBrand.colors.text, fontSize: 12, fontWeight: '900', marginTop: 11, marginBottom: 4 },
  hint: { color: ucapsaBrand.colors.muted, fontSize: 10, lineHeight: 15, fontWeight: '700', marginBottom: 5 },
  input: { minHeight: 46, borderRadius: 14, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, color: ucapsaBrand.colors.text, paddingHorizontal: 12, fontSize: 12, fontWeight: '700' },
  textArea: { minHeight: 105, paddingTop: 11, paddingBottom: 11 },
  readonly: { backgroundColor: ucapsaBrand.colors.graySoft, color: ucapsaBrand.colors.grayDark },
  actions: { gap: 8, marginTop: 18, marginBottom: 24 },
  primary: { alignItems: 'center', borderRadius: 15, backgroundColor: ucapsaBrand.colors.red, paddingVertical: 13 },
  primaryText: { color: ucapsaBrand.colors.surface, fontSize: 13, fontWeight: '900' },
  secondary: { alignItems: 'center', borderRadius: 15, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, paddingVertical: 13 },
  secondaryText: { color: ucapsaBrand.colors.text, fontSize: 13, fontWeight: '900' },
  disabled: { opacity: 0.45 },
});
