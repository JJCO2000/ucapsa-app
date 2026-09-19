import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import * as Clipboard from 'expo-clipboard';
import { Redirect, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { UcapsaAmbientBackground } from '../../components/layout/UcapsaAmbientBackground';
import { KeyboardAwareScreen } from '../../components/ui/KeyboardAwareScreen';
import { ucapsaBrand } from '../../constants/brand';
import { resolveUcapsaFormat } from '../../constants/ucapsaFormats';
import { useSession } from '../../hooks/useSession';
import { getMyPaymentOverview, getPaymentSettings, isValidClabe, isValidPaymentLink, normalizeClabe } from '../../services/payments.service';
import type { PaymentObligationWithBalance, PaymentSettings } from '../../types/app.types';
import { DEFAULT_READ_TIMEOUT_MS, withOperationTimeout } from '../../utils/async.utils';
import { money, paymentDateLabel } from '../../utils/paymentPresentation';

const whatsappUrl = ucapsaBrand.socialLinks.find((item) => item.key === 'whatsapp')?.url ?? 'https://wa.me/525522410679';

export default function PaymentTransferScreen() {
  const { obligationId: rawObligationId } = useLocalSearchParams<{ obligationId?: string | string[] }>();
  const obligationId = Array.isArray(rawObligationId) ? rawObligationId[0] ?? null : rawObligationId ?? null;
  const { user, role, isAdmin } = useSession();
  const [obligation, setObligation] = useState<PaymentObligationWithBalance | null>(null);
  const [settings, setSettings] = useState<PaymentSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadRunRef = useRef(0);
  const format = useMemo(() => resolveUcapsaFormat({ user, role, isAdmin }), [isAdmin, role, user]);
  const premium = format.key === 'member';

  const load = useCallback(async () => {
    const runId = loadRunRef.current + 1;
    loadRunRef.current = runId;
    const isCurrentRun = () => loadRunRef.current === runId;
    if (!user || isAdmin) return;

    setLoading(true);
    setError(null);
    // Nunca se conserva una cuenta bancaria anterior durante una nueva verificación.
    setSettings(null);
    setObligation(null);

    const [overviewResult, settingsResult] = await Promise.allSettled([
      withOperationTimeout(getMyPaymentOverview(), DEFAULT_READ_TIMEOUT_MS, 'payment-transfer-obligation'),
      withOperationTimeout(getPaymentSettings(), DEFAULT_READ_TIMEOUT_MS, 'payment-transfer-settings'),
    ]);
    if (!isCurrentRun()) return;

    if (overviewResult.status !== 'fulfilled') {
      setError('No pudimos verificar el cargo. Conéctate antes de transferir.');
      setLoading(false);
      return;
    }
    const found = obligationId ? overviewResult.value.obligations.find((item) => item.id === obligationId) ?? null : null;
    if (!found) {
      setError('Este cargo ya no está disponible como pendiente. Regresa a Pagos y actualiza.');
      setLoading(false);
      return;
    }
    setObligation(found);

    if (settingsResult.status !== 'fulfilled') {
      setError('No pudimos verificar los datos bancarios. No transfieras hasta volver a conectarte.');
      setLoading(false);
      return;
    }
    setSettings(settingsResult.value);
    setLoading(false);
  }, [isAdmin, obligationId, user]);

  useFocusEffect(useCallback(() => {
    void load();
    return () => { loadRunRef.current += 1; };
  }, [load]));

  async function refresh() { setRefreshing(true); try { await load(); } finally { setRefreshing(false); } }

  async function copyClabe() {
    const clabe = normalizeClabe(settings?.clabe);
    if (!isValidClabe(clabe)) {
      Alert.alert('CLABE no verificada', 'No copies ni transfieras hasta que UCAPSA publique una CLABE válida de 18 dígitos.');
      return;
    }
    await Clipboard.setStringAsync(clabe);
    Alert.alert('CLABE copiada', 'Pégala en tu aplicación bancaria y verifica que el titular coincida antes de confirmar.');
  }

  async function openWhatsApp() {
    try { await Linking.openURL(whatsappUrl); }
    catch { Alert.alert('No se pudo abrir WhatsApp', 'Usa el canal oficial de UCAPSA para enviar tu comprobante.'); }
  }

  if (!user) return <Redirect href="/auth/login" />;
  if (isAdmin) return <Redirect href="/admin-payments" />;

  const bankReady = Boolean(settings?.is_active && isValidClabe(settings.clabe) && settings.bank_name && settings.account_holder);
  const paymentLink = settings?.clip_url && isValidPaymentLink(settings.clip_url) ? settings.clip_url : null;

  return (
    <KeyboardAwareScreen style={{ backgroundColor: format.background }} contentContainerStyle={premium ? styles.premiumContent : undefined} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={format.accent} />}>
      <UcapsaAmbientBackground format={format} variant="payments" />
      <Text style={[styles.eyebrow, { color: premium ? ucapsaBrand.colors.premiumAction : format.accentDark }]}>ACCIÓN DE PAGO</Text>
      <Text style={[styles.title, { color: format.text }]}>Transferir</Text>
      <Text style={[styles.subtitle, { color: premium ? ucapsaBrand.colors.premiumMuted : format.muted }]}>Los datos bancarios se verifican en vivo cada vez que abres esta pantalla.</Text>

      {loading ? <View style={styles.loading}><ActivityIndicator color={format.accent} /><Text style={[styles.subtitle, { color: format.muted }]}>Verificando cargo y cuenta bancaria...</Text></View> : null}

      {!loading && error ? <View style={[styles.card, premium && styles.cardPremium]}><MaterialIcons name="lock-outline" size={23} color={premium ? ucapsaBrand.colors.premiumAction : format.accentDark} /><Text style={[styles.cardTitle, premium && styles.textPremium]}>{error}</Text><Pressable onPress={() => void refresh()}><Text style={[styles.link, { color: premium ? ucapsaBrand.colors.premiumAction : format.accentDark }]}>Reintentar verificación</Text></Pressable></View> : null}

      {!loading && obligation && bankReady ? (
        <>
          <View style={[styles.card, premium && styles.cardPremium]}>
            <Text style={[styles.label, premium && styles.mutedPremium]}>CARGO</Text>
            <Text style={[styles.cardTitle, premium && styles.textPremium]}>{obligation.concept}</Text>
            <Text style={[styles.amount, premium && styles.goldText]}>{money(obligation.remaining_amount)}</Text>
            <Text style={[styles.meta, premium && styles.mutedPremium]}>Vence {paymentDateLabel(obligation.due_date)}</Text>
          </View>

          <View style={[styles.card, premium && styles.cardPremium]}>
            <BankRow label="Banco" value={settings?.bank_name ?? ''} premium={premium} />
            <BankRow label="Titular" value={settings?.account_holder ?? ''} premium={premium} />
            <BankRow label="CLABE" value={normalizeClabe(settings?.clabe)} premium={premium} selectable />
            {settings?.transfer_instructions ? <BankRow label="Concepto / referencia" value={settings.transfer_instructions} premium={premium} /> : null}
          </View>

          <Pressable accessibilityRole="button" accessibilityLabel="Copiar CLABE" onPress={() => void copyClabe()} style={[styles.primaryButton, { backgroundColor: format.primaryButton }]}>
            <MaterialIcons name="content-copy" size={20} color={format.primaryButtonText} />
            <Text style={[styles.primaryText, { color: format.primaryButtonText }]}>Copiar CLABE</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Enviar comprobante por WhatsApp" onPress={() => void openWhatsApp()} style={[styles.secondaryButton, premium && styles.secondaryPremium]}>
            <MaterialIcons name="chat" size={20} color={premium ? ucapsaBrand.colors.premiumAction : format.accentDark} />
            <Text style={[styles.secondaryText, { color: premium ? ucapsaBrand.colors.premiumAction : format.accentDark }]}>Enviar comprobante</Text>
          </Pressable>
          {paymentLink ? <Pressable accessibilityRole="button" accessibilityLabel="Abrir enlace de pago" onPress={() => void Linking.openURL(paymentLink).catch(() => Alert.alert('No se pudo abrir', 'Revisa el enlace de pago con UCAPSA.'))}><Text style={[styles.linkCenter, { color: premium ? ucapsaBrand.colors.premiumAction : format.accentDark }]}>Abrir enlace de pago</Text></Pressable> : null}
        </>
      ) : null}

      {!loading && obligation && settings && !bankReady && !error ? (
        <View style={[styles.card, premium && styles.cardPremium]}><Text style={[styles.cardTitle, premium && styles.textPremium]}>Datos bancarios no válidos</Text><Text style={[styles.meta, premium && styles.mutedPremium]}>No transfieras hasta que UCAPSA publique una CLABE activa y válida de 18 dígitos.</Text></View>
      ) : null}
    </KeyboardAwareScreen>
  );
}

function BankRow({ label, value, premium, selectable = false }: { label: string; value: string; premium: boolean; selectable?: boolean }) {
  return <View style={styles.bankRow}><Text style={[styles.label, premium && styles.mutedPremium]}>{label.toUpperCase()}</Text><Text selectable={selectable} style={[styles.bankValue, premium && styles.textPremium]}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  premiumContent: { backgroundColor: ucapsaBrand.colors.premiumBackground },
  eyebrow: { fontSize: 10, lineHeight: 13, fontWeight: '900', letterSpacing: 1 },
  title: { fontSize: 28, lineHeight: 32, fontWeight: '900' },
  subtitle: { fontSize: 13, lineHeight: 19, fontWeight: '700', marginBottom: 14 },
  loading: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 16 },
  card: { gap: 8, borderWidth: 1, borderColor: ucapsaBrand.colors.border, borderRadius: 22, padding: 16, backgroundColor: ucapsaBrand.colors.surface, marginBottom: 12 },
  cardPremium: { borderColor: ucapsaBrand.colors.premiumBorder, backgroundColor: ucapsaBrand.colors.premiumSurface },
  label: { color: ucapsaBrand.colors.muted, fontSize: 9, lineHeight: 12, fontWeight: '900', letterSpacing: 0.7 },
  cardTitle: { color: ucapsaBrand.colors.text, fontSize: 17, lineHeight: 22, fontWeight: '900' },
  amount: { color: ucapsaBrand.colors.redDark, fontSize: 28, lineHeight: 32, fontWeight: '900' },
  meta: { color: ucapsaBrand.colors.muted, fontSize: 12, lineHeight: 18, fontWeight: '700' },
  bankRow: { gap: 3, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: ucapsaBrand.colors.border },
  bankValue: { color: ucapsaBrand.colors.text, fontSize: 15, lineHeight: 20, fontWeight: '900' },
  primaryButton: { minHeight: 54, borderRadius: 17, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 16, marginBottom: 9 },
  primaryText: { fontSize: 14, fontWeight: '900' },
  secondaryButton: { minHeight: 52, borderWidth: 1, borderColor: ucapsaBrand.colors.border, borderRadius: 17, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: ucapsaBrand.colors.surface },
  secondaryPremium: { borderColor: ucapsaBrand.colors.premiumBorder, backgroundColor: ucapsaBrand.colors.premiumSurface },
  secondaryText: { fontSize: 14, fontWeight: '900' },
  link: { fontSize: 12, fontWeight: '900' },
  linkCenter: { textAlign: 'center', paddingVertical: 14, fontSize: 12, fontWeight: '900' },
  textPremium: { color: ucapsaBrand.colors.premiumText },
  mutedPremium: { color: ucapsaBrand.colors.premiumMuted },
  goldText: { color: ucapsaBrand.colors.premiumActionText },
});
