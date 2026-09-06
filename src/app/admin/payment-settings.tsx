import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import { KeyboardAwareScreen } from '../../components/ui/KeyboardAwareScreen';
import { ucapsaBrand } from '../../constants/brand';
import { getPaymentSettings, updatePaymentSettings } from '../../services/payments.service';

export default function AdminPaymentSettingsScreen() {
  const [bankName, setBankName] = useState('');
  const [accountHolder, setAccountHolder] = useState('');
  const [clabe, setClabe] = useState('');
  const [transferInstructions, setTransferInstructions] = useState('');
  const [clipUrl, setClipUrl] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [showExtra, setShowExtra] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const row = await getPaymentSettings();
      setBankName(row?.bank_name ?? '');
      setAccountHolder(row?.account_holder ?? '');
      setClabe(row?.clabe ?? '');
      setTransferInstructions(row?.transfer_instructions ?? '');
      setClipUrl(row?.clip_url ?? '');
      setIsActive(row?.is_active ?? true);
    } catch (err) {
      Alert.alert('No se pudo cargar', err instanceof Error ? err.message : 'Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { void load(); return undefined; }, [load]));

  async function refresh() {
    setRefreshing(true);
    try { await load(); } finally { setRefreshing(false); }
  }

  async function save() {
    const cleanClabe = clabe.replace(/\D/g, '');
    if (cleanClabe && cleanClabe.length !== 18) {
      Alert.alert('CLABE incompleta', 'La CLABE debe tener exactamente 18 digitos.');
      return;
    }
    setSaving(true);
    try {
      await updatePaymentSettings({
        bankName,
        accountHolder,
        clabe: cleanClabe,
        transferInstructions,
        clipUrl,
        isActive,
      });
      setClabe(cleanClabe);
      Alert.alert('Guardado', 'Los clientes veran estos datos desde Pagos.');
    } catch (err) {
      Alert.alert('No se pudo guardar', err instanceof Error ? err.message : 'Intenta de nuevo.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <KeyboardAwareScreen refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={ucapsaBrand.colors.red} />}>
      <View style={styles.header}>
        <Text style={styles.kicker}>Pagos</Text>
        <Text style={styles.title}>Configuracion bancaria</Text>
        <Text style={styles.subtitle}>Esta es la unica fuente de datos que consulta la seccion Pagos del cliente.</Text>
      </View>

      {loading ? <View style={styles.loading}><ActivityIndicator color={ucapsaBrand.colors.red} /><Text style={styles.muted}>Cargando configuracion...</Text></View> : (
        <>
          <View style={styles.card}>
            <Field label="Banco" value={bankName} onChangeText={setBankName} placeholder="Nombre del banco" />
            <Field label="Titular / beneficiario" value={accountHolder} onChangeText={setAccountHolder} placeholder="Nombre del titular" />
            <Text style={styles.label}>CLABE</Text>
            <TextInput
              value={clabe}
              onChangeText={(value) => setClabe(value.replace(/\D/g, '').slice(0, 18))}
              placeholder="18 digitos"
              keyboardType="number-pad"
              maxLength={18}
              style={styles.input}
            />
            <Text style={styles.helper}>{clabe.length}/18 digitos</Text>
            <Text style={styles.label}>Concepto / referencia</Text>
            <TextInput
              value={transferInstructions}
              onChangeText={setTransferInstructions}
              placeholder="Ejemplo: nombre del cliente o numero de socio"
              multiline
              style={[styles.input, styles.multiline]}
            />
          </View>

          <View style={styles.card}>
            <View style={styles.switchRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>Visible para clientes</Text>
                <Text style={styles.muted}>Si se apaga, Pagos no mostrara instrucciones bancarias.</Text>
              </View>
              <Switch value={isActive} onValueChange={setIsActive} trackColor={{ false: ucapsaBrand.colors.borderNeutral, true: ucapsaBrand.colors.redBorder }} thumbColor={isActive ? ucapsaBrand.colors.red : ucapsaBrand.colors.surface} />
            </View>
          </View>

          <Pressable style={styles.extraHeader} onPress={() => setShowExtra((value) => !value)}>
            <View style={{ flex: 1 }}><Text style={styles.cardTitle}>Opciones adicionales</Text><Text style={styles.muted}>Solo si UCAPSA usa un enlace de pago.</Text></View>
            <MaterialIcons name={showExtra ? 'expand-less' : 'expand-more'} size={24} color={ucapsaBrand.colors.redDark} />
          </Pressable>
          {showExtra ? (
            <View style={styles.card}>
              <Field label="Enlace de pago Clip" value={clipUrl} onChangeText={setClipUrl} placeholder="https://..." autoCapitalize="none" keyboardType="url" />
            </View>
          ) : null}

          <Pressable style={styles.primaryButton} disabled={saving} onPress={() => void save()}>
            <Text style={styles.primaryButtonText}>{saving ? 'Guardando...' : 'Guardar configuracion'}</Text>
          </Pressable>
        </>
      )}
    </KeyboardAwareScreen>
  );
}

function Field({ label, value, onChangeText, placeholder, autoCapitalize, keyboardType }: { label: string; value: string; onChangeText: (value: string) => void; placeholder: string; autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters'; keyboardType?: 'default' | 'url' }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} autoCapitalize={autoCapitalize} keyboardType={keyboardType} style={styles.input} />
    </View>
  );
}

const styles = StyleSheet.create({
  header: { gap: 4, marginBottom: 16 },
  kicker: { color: ucapsaBrand.colors.redDark, fontSize: 12, fontWeight: '900', textTransform: 'uppercase' },
  title: { color: ucapsaBrand.colors.text, fontSize: 28, fontWeight: '900' },
  subtitle: { color: ucapsaBrand.colors.muted, fontSize: 13, lineHeight: 19, fontWeight: '700' },
  loading: { flexDirection: 'row', gap: 10, alignItems: 'center', paddingVertical: 16 },
  muted: { color: ucapsaBrand.colors.muted, fontSize: 13, lineHeight: 19, fontWeight: '700' },
  card: { gap: 11, borderRadius: 20, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, padding: 16, marginBottom: 13 },
  field: { gap: 6 },
  label: { color: ucapsaBrand.colors.text, fontSize: 12, fontWeight: '900' },
  input: { borderRadius: 14, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, paddingHorizontal: 13, paddingVertical: 11, color: ucapsaBrand.colors.text, fontSize: 15 },
  multiline: { minHeight: 84, textAlignVertical: 'top' },
  helper: { color: ucapsaBrand.colors.muted, fontSize: 11, fontWeight: '700', marginTop: -6 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  cardTitle: { color: ucapsaBrand.colors.text, fontSize: 16, fontWeight: '900' },
  extraHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 18, borderWidth: 1, borderColor: ucapsaBrand.colors.border, backgroundColor: ucapsaBrand.colors.surface, padding: 15, marginBottom: 13 },
  primaryButton: { alignItems: 'center', borderRadius: 17, backgroundColor: ucapsaBrand.colors.red, paddingVertical: 13 },
  primaryButtonText: { color: ucapsaBrand.colors.surface, fontSize: 14, fontWeight: '900' },
});
