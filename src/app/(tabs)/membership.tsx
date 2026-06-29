import { useCallback, useState } from 'react';
import { Alert, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { Link, useFocusEffect } from 'expo-router';
import QRCode from 'react-native-qrcode-svg';
import { KeyboardAwareScreen } from '../../components/ui/KeyboardAwareScreen';
import {
  formatDate,
  getMembershipStatusLabel,
  getMyMembership,
  getPaymentStatusLabel,
  isMembershipDateExpired,
  requestMembership,
} from '../../services/memberships.service';
import type { Membership } from '../../types/app.types';
import { useSession } from '../../hooks/useSession';

export default function MembershipScreen() {
  const { user, profile, role, isAdmin } = useSession();
  const [membership, setMembership] = useState<Membership | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const loadMembership = useCallback(async () => {
    if (!user || isAdmin) return;
    setLoading(true);
    try {
      const data = await getMyMembership();
      setMembership(data);
    } catch (error) {
      Alert.alert('No se pudo cargar', error instanceof Error ? error.message : 'Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  }, [user, isAdmin]);

  useFocusEffect(
    useCallback(() => {
      loadMembership();
    }, [loadMembership]),
  );

  async function handleRefresh() {
    setRefreshing(true);
    await loadMembership();
    setRefreshing(false);
  }

  async function handleRequestMembership() {
    try {
      const data = await requestMembership();
      setMembership(data);
      Alert.alert('Solicitud enviada', 'Administración revisará tu solicitud de membresía.');
    } catch (error) {
      Alert.alert('No se pudo solicitar', error instanceof Error ? error.message : 'Intenta de nuevo.');
    }
  }

  if (!user) {
    return (
      <KeyboardAwareScreen>
        <Text style={styles.eyebrow}>Mi UCAPSA</Text>
        <Text style={styles.title}>Credencial y membresía</Text>
        <Text style={styles.muted}>Inicia sesión para solicitar membresía o ver tu credencial digital.</Text>
        <Link href="/auth/login" asChild>
          <Pressable style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>Iniciar sesión</Text>
          </Pressable>
        </Link>
      </KeyboardAwareScreen>
    );
  }

  if (isAdmin) {
    return (
      <KeyboardAwareScreen>
        <Text style={styles.eyebrow}>Administración</Text>
        <Text style={styles.title}>Socios UCAPSA</Text>
        <Text style={styles.muted}>Como {role}, aquí no necesitas solicitar membresía. Usa el panel administrativo para revisar solicitudes, tabla de socios y pagos.</Text>

        <View style={styles.adminCard}>
          <Text style={styles.cardTitle}>Panel de socios</Text>
          <Text style={styles.cardText}>Revisa pendientes, socios activos, pagos pendientes, historial y datos completos.</Text>
          <Link href="/admin/members" asChild>
            <Pressable style={styles.primaryButton}>
              <Text style={styles.primaryButtonText}>Abrir Admin → Socios</Text>
            </Pressable>
          </Link>
        </View>
      </KeyboardAwareScreen>
    );
  }

  const expiredByDate = isMembershipDateExpired(membership);
  const displayName = profile?.full_name || profile?.email || user.email || 'Usuario';

  return (
    <KeyboardAwareScreen
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
    >
      <Text style={styles.eyebrow}>Mi UCAPSA</Text>
      <Text style={styles.title}>Credencial digital</Text>
      <Text style={styles.muted}>Consulta tu estado de socio, pago y QR. Los cambios de membresía siempre los confirma administración.</Text>

      {loading ? <Text style={styles.muted}>Cargando membresía...</Text> : null}

      {!membership ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Aún no tienes membresía</Text>
          <Text style={styles.cardText}>Solicita tu membresía para que administración revise y active tu credencial.</Text>
          <Pressable onPress={handleRequestMembership} style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>Solicitar membresía</Text>
          </Pressable>
        </View>
      ) : null}

      {membership?.status === 'pending' ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Solicitud pendiente</Text>
          <Text style={styles.cardText}>Tu solicitud ya fue enviada. Administración la revisará y activará tu número de socio si corresponde.</Text>
        </View>
      ) : null}

      {membership ? (
        <View style={styles.credential}>
          <View style={styles.credentialHeader}>
            <View style={[styles.avatar, { backgroundColor: profile?.avatar_color ?? '#0f766e' }]}>
              <Text style={styles.avatarText}>{displayName.slice(0, 1).toUpperCase()}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.credentialLabel}>Socio UCAPSA</Text>
              <Text style={styles.credentialName}>{displayName}</Text>
              <Text style={styles.credentialDog}>Perro: {profile?.dog_name || 'Sin registrar'}</Text>
            </View>
          </View>

          <View style={styles.infoGrid}>
            <Info label="Número" value={membership.member_number || 'Pendiente'} />
            <Info label="Estado" value={getMembershipStatusLabel(membership.status)} />
            <Info label="Inicio" value={formatDate(membership.start_date)} />
            <Info label="Vigencia" value={formatDate(membership.end_date)} />
            <Info label="Pago" value={getPaymentStatusLabel(membership.current_payment_status)} />
            <Info label="Ášltimo pago" value={formatDate(membership.last_payment_at)} />
          </View>

          {expiredByDate && membership.status === 'active' ? (
            <View style={styles.warningBox}>
              <Text style={styles.warningText}>La fecha de vigencia ya pasó. Esto no cancela automáticamente tu membresía; administración debe confirmar el estado.</Text>
            </View>
          ) : null}

          {membership.current_payment_status !== 'paid' ? (
            <View style={styles.warningBox}>
              <Text style={styles.warningText}>Pago marcado como {getPaymentStatusLabel(membership.current_payment_status)}. Si ya pagaste, espera a que administración lo registre.</Text>
            </View>
          ) : null}

          <View style={styles.qrBox}>
            <QRCode value={`ucapsa-member:${membership.qr_token}`} size={180} />
            <Text style={styles.qrText}>QR de verificación</Text>
            <Text style={styles.qrSubtext}>El QR no contiene tus datos personales, solo un token de verificación.</Text>
          </View>
        </View>
      ) : null}
    </KeyboardAwareScreen>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoItem}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  eyebrow: { color: '#0f766e', fontSize: 13, fontWeight: '800', letterSpacing: 0.5, textTransform: 'uppercase' },
  title: { color: '#0f172a', fontSize: 30, fontWeight: '900', marginTop: 6 },
  muted: { color: '#64748b', fontSize: 15, lineHeight: 22, marginTop: 8, marginBottom: 18 },
  card: { backgroundColor: '#ffffff', borderRadius: 22, borderWidth: 1, borderColor: '#e2e8f0', padding: 18, marginBottom: 16 },
  adminCard: { backgroundColor: '#ecfdf5', borderRadius: 22, borderWidth: 1, borderColor: '#99f6e4', padding: 18, marginTop: 10 },
  cardTitle: { color: '#0f172a', fontSize: 20, fontWeight: '900', marginBottom: 8 },
  cardText: { color: '#64748b', fontSize: 15, lineHeight: 22 },
  primaryButton: { backgroundColor: '#0f766e', borderRadius: 16, paddingVertical: 14, alignItems: 'center', marginTop: 16 },
  primaryButtonText: { color: '#ffffff', fontWeight: '900', fontSize: 15 },
  credential: { backgroundColor: '#ffffff', borderRadius: 28, padding: 18, borderWidth: 1, borderColor: '#e2e8f0' },
  credentialHeader: { flexDirection: 'row', gap: 14, alignItems: 'center', marginBottom: 18 },
  avatar: { width: 68, height: 68, borderRadius: 34, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#ffffff', fontSize: 30, fontWeight: '900' },
  credentialLabel: { color: '#0f766e', fontSize: 12, fontWeight: '900', textTransform: 'uppercase' },
  credentialName: { color: '#0f172a', fontSize: 22, fontWeight: '900', marginTop: 2 },
  credentialDog: { color: '#64748b', fontSize: 14, marginTop: 4, fontWeight: '700' },
  infoGrid: { gap: 10 },
  infoItem: { backgroundColor: '#f8fafc', borderRadius: 16, padding: 12 },
  infoLabel: { color: '#64748b', fontSize: 12, fontWeight: '800', textTransform: 'uppercase' },
  infoValue: { color: '#0f172a', fontSize: 16, fontWeight: '900', marginTop: 4 },
  warningBox: { backgroundColor: '#fff7ed', borderColor: '#fed7aa', borderWidth: 1, borderRadius: 16, padding: 12, marginTop: 14 },
  warningText: { color: '#9a3412', fontSize: 13, lineHeight: 19, fontWeight: '700' },
  qrBox: { alignItems: 'center', marginTop: 20, paddingTop: 18, borderTopWidth: 1, borderTopColor: '#e2e8f0' },
  qrText: { color: '#0f172a', fontSize: 15, fontWeight: '900', marginTop: 12 },
  qrSubtext: { color: '#64748b', fontSize: 12, textAlign: 'center', marginTop: 4, lineHeight: 18 },
});
