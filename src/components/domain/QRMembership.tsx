import { ucapsaBrand, withAlpha } from '../../constants/brand';
import { StyleSheet, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import type { Membership, Profile } from '../../types/app.types';

function formatDate(value: string | null): string {
  if (!value) return 'Sin fecha';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleDateString('es-MX', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

type QRMembershipProps = {
  membership: Membership;
  profile: Profile | null;
};

export function QRMembership({ membership, profile }: QRMembershipProps) {
  const qrValue = `ucapsa-member:${membership.qr_token}`;

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View>
          <Text style={styles.kicker}>Credencial digital</Text>
          <Text style={styles.name}>{profile?.full_name || profile?.email || 'Socio UCAPSA'}</Text>
        </View>
        <Text style={styles.status}>Activo</Text>
      </View>

      <View style={styles.infoGrid}>
        <View style={styles.infoBox}>
          <Text style={styles.label}>Numero de socio</Text>
          <Text style={styles.value}>{membership.member_number || 'Pendiente'}</Text>
        </View>
        <View style={styles.infoBox}>
          <Text style={styles.label}>Vigencia</Text>
          <Text style={styles.value}>{formatDate(membership.end_date)}</Text>
        </View>
      </View>

      <View style={styles.qrBox}>
        <QRCode value={qrValue} size={190} />
        <Text style={styles.qrHelp}>QR de verificacion. No contiene datos personales.</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 18,
    borderRadius: 28,
    backgroundColor: ucapsaBrand.colors.green,
    padding: 20,
    shadowColor: ucapsaBrand.colors.cameraDark,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
    elevation: 4,
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  kicker: { color: ucapsaBrand.colors.greenSoft, fontSize: 12, fontWeight: '800', textTransform: 'uppercase' },
  name: { marginTop: 4, color: ucapsaBrand.colors.surface, fontSize: 23, fontWeight: '900' },
  status: {
    alignSelf: 'flex-start',
    overflow: 'hidden',
    borderRadius: 999,
    backgroundColor: ucapsaBrand.colors.greenSoft,
    color: ucapsaBrand.colors.green,
    paddingHorizontal: 12,
    paddingVertical: 6,
    fontSize: 12,
    fontWeight: '900',
  },
  infoGrid: { flexDirection: 'row', gap: 12 },
  infoBox: { flex: 1, borderRadius: 18, backgroundColor: withAlpha(ucapsaBrand.colors.surface, 0.14), padding: 14 },
  label: { color: ucapsaBrand.colors.greenSoft, fontSize: 11, fontWeight: '800' },
  value: { marginTop: 4, color: ucapsaBrand.colors.surface, fontSize: 14, fontWeight: '900' },
  qrBox: { alignItems: 'center', gap: 10, borderRadius: 22, backgroundColor: ucapsaBrand.colors.surface, padding: 18 },
  qrHelp: { color: ucapsaBrand.colors.mutedNeutral, fontSize: 12, fontWeight: '700', textAlign: 'center' },
});
