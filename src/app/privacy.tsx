import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { KeyboardAwareScreen } from '../components/ui/KeyboardAwareScreen';
import { ucapsaBrand } from '../constants/brand';
import { getPublishedPrivacyNotice, type PrivacyNotice } from '../services/privacy-notice.service';

function Section({ title, value }: { title: string; value: string | null | undefined }) {
  if (!value?.trim()) return null;
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Text style={styles.body}>{value.trim()}</Text>
    </View>
  );
}

export default function PrivacyNoticeScreen() {
  const [notice, setNotice] = useState<PrivacyNotice | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void getPublishedPrivacyNotice()
      .then((row) => {
        if (!active) return;
        setNotice(row);
        setError(null);
      })
      .catch((cause) => {
        if (!active) return;
        setError(cause instanceof Error ? cause.message : 'No se pudo cargar el aviso.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  return (
    <KeyboardAwareScreen>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="Volver" style={styles.back} onPress={() => router.back()}>
          <MaterialIcons name="arrow-back" size={22} color={ucapsaBrand.colors.redDark} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.kicker}>UCAPSA · Privacidad</Text>
          <Text style={styles.title}>Aviso de privacidad</Text>
        </View>
      </View>

      {loading ? <Text style={styles.muted}>Cargando aviso...</Text> : null}

      {!loading && error ? (
        <View style={styles.warning}>
          <MaterialIcons name="error-outline" size={21} color={ucapsaBrand.colors.danger} />
          <Text style={styles.warningText}>No se pudo consultar el aviso publicado. {error}</Text>
        </View>
      ) : null}

      {!loading && !error && !notice ? (
        <View style={styles.warning}>
          <MaterialIcons name="policy" size={21} color={ucapsaBrand.colors.redDark} />
          <Text style={styles.warningText}>UCAPSA aún no tiene una versión publicada en la app. No se mostrará texto legal inventado ni incompleto.</Text>
        </View>
      ) : null}

      {notice ? (
        <>
          <View style={styles.summary}>
            <Text style={styles.version}>Versión {notice.version}</Text>
            {notice.effective_from ? <Text style={styles.muted}>Vigente desde {new Date(notice.effective_from).toLocaleDateString('es-MX')}</Text> : null}
            <Text style={styles.summaryText}>{notice.simplified_notice}</Text>
          </View>

          <Section title="Responsable" value={notice.responsible_name} />
          <Section title="Domicilio del responsable" value={notice.responsible_address} />
          <Section title="Contacto de privacidad" value={notice.contact_email} />
          <Section title="Datos personales tratados" value={notice.data_categories} />
          <Section title="Datos personales sensibles" value={notice.sensitive_data_categories} />
          <Section title="Finalidades" value={notice.purposes} />
          <Section title="Finalidades que requieren consentimiento" value={notice.consent_required_purposes} />
          <Section title="Limitación de uso o divulgación" value={notice.limitation_mechanisms} />
          <Section title="Derechos ARCO" value={notice.arco_procedure} />
          <Section title="Transferencias" value={notice.transfer_clause} />
          <Section title="Cambios al aviso" value={notice.change_notice_method} />

          <View style={styles.integral}>
            <Text style={styles.sectionTitle}>Aviso integral</Text>
            <Text style={styles.body}>{notice.integral_notice}</Text>
          </View>
        </>
      ) : null}
    </KeyboardAwareScreen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 18 },
  back: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: ucapsaBrand.colors.redSoft },
  kicker: { color: ucapsaBrand.colors.redDark, fontSize: 11, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.7 },
  title: { color: ucapsaBrand.colors.text, fontSize: 28, fontWeight: '900' },
  muted: { color: ucapsaBrand.colors.muted, fontSize: 12, lineHeight: 18, fontWeight: '700' },
  warning: { flexDirection: 'row', gap: 9, borderRadius: 16, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surfaceAlt, padding: 13 },
  warningText: { flex: 1, color: ucapsaBrand.colors.text, fontSize: 12, lineHeight: 18, fontWeight: '700' },
  summary: { borderRadius: 20, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, padding: 16, marginBottom: 14 },
  version: { color: ucapsaBrand.colors.redDark, fontSize: 12, fontWeight: '900', marginBottom: 4 },
  summaryText: { color: ucapsaBrand.colors.text, fontSize: 14, lineHeight: 21, fontWeight: '700', marginTop: 10 },
  section: { borderBottomWidth: 1, borderBottomColor: ucapsaBrand.colors.border, paddingVertical: 14 },
  sectionTitle: { color: ucapsaBrand.colors.text, fontSize: 15, fontWeight: '900', marginBottom: 5 },
  body: { color: ucapsaBrand.colors.muted, fontSize: 12, lineHeight: 19, fontWeight: '700' },
  integral: { borderRadius: 20, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, padding: 16, marginTop: 16, marginBottom: 20 },
});
