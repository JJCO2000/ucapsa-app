import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { KeyboardAwareScreen } from '../components/ui/KeyboardAwareScreen';
import { ucapsaBrand } from '../constants/brand';
import {
  UCAPSA_LEGAL_EFFECTIVE_DATE,
  UCAPSA_TERMS_SECTIONS,
  UCAPSA_TERMS_VERSION,
} from '../constants/legal';

export default function TermsScreen() {
  return (
    <KeyboardAwareScreen>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Volver"
          style={styles.back}
          onPress={() => router.back()}
        >
          <MaterialIcons name="arrow-back" size={22} color={ucapsaBrand.colors.redDark} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.kicker}>UCAPSA · Legal</Text>
          <Text style={styles.title}>Términos de uso</Text>
        </View>
      </View>

      <View style={styles.summary}>
        <Text style={styles.version}>Versión {UCAPSA_TERMS_VERSION}</Text>
        <Text style={styles.muted}>Vigentes desde {UCAPSA_LEGAL_EFFECTIVE_DATE}</Text>
        <Text style={styles.summaryText}>
          Estos términos regulan el uso de UCAPSA App. No sustituyen contratos, comprobantes fiscales
          ni otros documentos que UCAPSA emita por separado.
        </Text>
      </View>

      {UCAPSA_TERMS_SECTIONS.map((section) => (
        <View key={section.title} style={styles.section}>
          <Text style={styles.sectionTitle}>{section.title}</Text>
          <Text style={styles.body}>{section.body}</Text>
        </View>
      ))}
    </KeyboardAwareScreen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 18 },
  back: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ucapsaBrand.colors.redSoft,
  },
  kicker: {
    color: ucapsaBrand.colors.redDark,
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.7,
  },
  title: { color: ucapsaBrand.colors.text, fontSize: 28, fontWeight: '900' },
  muted: { color: ucapsaBrand.colors.muted, fontSize: 12, lineHeight: 18, fontWeight: '700' },
  summary: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: ucapsaBrand.colors.border,
    backgroundColor: ucapsaBrand.colors.surface,
    padding: 16,
    marginBottom: 14,
  },
  version: { color: ucapsaBrand.colors.redDark, fontSize: 12, fontWeight: '900', marginBottom: 4 },
  summaryText: {
    color: ucapsaBrand.colors.text,
    fontSize: 14,
    lineHeight: 21,
    fontWeight: '700',
    marginTop: 10,
  },
  section: {
    borderBottomWidth: 1,
    borderBottomColor: ucapsaBrand.colors.border,
    paddingVertical: 14,
  },
  sectionTitle: { color: ucapsaBrand.colors.text, fontSize: 15, fontWeight: '900', marginBottom: 5 },
  body: { color: ucapsaBrand.colors.muted, fontSize: 12, lineHeight: 19, fontWeight: '700' },
});
