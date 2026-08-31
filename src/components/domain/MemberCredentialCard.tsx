import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { StyleSheet, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { ucapsaBrand, withAlpha } from '../../constants/brand';
import { formatDate } from '../../services/memberships.service';
import type { Membership, Profile } from '../../types/app.types';

type MemberCredentialCardProps = {
  membership: Membership;
  profile: Profile | null;
  displayName: string;
  expiredByDate: boolean;
};

export function MemberCredentialCard({ membership, profile: _profile, displayName, expiredByDate }: MemberCredentialCardProps) {
  return (
    <View style={styles.card}>
      <View style={styles.glowOne} />
      <View style={styles.glowTwo} />

      <View style={styles.headerRow}>
        <View style={styles.crownBox}>
          <MaterialCommunityIcons name="crown" size={30} color={ucapsaBrand.colors.premiumActionText} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.kicker}>Credencial UCAPSA</Text>
          <Text style={styles.title}>Socio UCAPSA</Text>
          <Text style={styles.name}>{displayName}</Text>
        </View>
      </View>

      <View style={styles.memberNumberBox}>
        <Text style={styles.memberNumberLabel}>Numero de socio</Text>
        <Text style={styles.memberNumber}>{membership.member_number || 'Pendiente'}</Text>
      </View>

      <View style={styles.infoGrid}>
        <Info label="Estado" value="Activo" />
        <Info label="Inicio" value={formatDate(membership.start_date)} />
        <Info label="Vigencia" value={formatDate(membership.end_date)} />
      </View>

      {expiredByDate ? (
        <View style={styles.warningBox}>
          <Text style={styles.warningText}>La vigencia ya paso. Administracion debe revisar el estado.</Text>
        </View>
      ) : null}

      <View style={styles.qrPanel}>
        <View style={styles.qrWhiteBox}>
          <QRCode value={`ucapsa-member:${membership.qr_token}`} size={176} />
        </View>
        <Text style={styles.qrTitle}>QR de verificacion</Text>
        <Text style={styles.qrSubtitle}>Usa este QR para identificar tu membresia.</Text>
      </View>
    </View>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoBox}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { position: 'relative', overflow: 'hidden', gap: 16, borderRadius: 32, padding: 20, backgroundColor: ucapsaBrand.colors.red, borderWidth: 1, borderColor: ucapsaBrand.colors.redBorder },
  glowOne: { position: 'absolute', top: -52, right: -44, width: 150, height: 150, borderRadius: 75, backgroundColor: ucapsaBrand.colors.dangerBorder, opacity: 0.24 },
  glowTwo: { position: 'absolute', bottom: -56, left: -50, width: 160, height: 160, borderRadius: 80, backgroundColor: ucapsaBrand.colors.premiumHero, opacity: 0.26 },
  headerRow: { flexDirection: 'row', gap: 14, alignItems: 'center' },
  crownBox: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', backgroundColor: ucapsaBrand.colors.premiumAction, borderWidth: 2, borderColor: ucapsaBrand.colors.gold },
  kicker: { color: ucapsaBrand.colors.premiumMuted, fontSize: 11, fontWeight: '900', letterSpacing: 0.9, textTransform: 'uppercase' },
  title: { color: ucapsaBrand.colors.surface, fontSize: 28, fontWeight: '900', marginTop: 1 },
  name: { color: ucapsaBrand.colors.redSoft, fontSize: 16, fontWeight: '900', marginTop: 3 },
  memberNumberBox: { padding: 14, borderRadius: 22, backgroundColor: withAlpha(ucapsaBrand.colors.surface, 0.94), borderWidth: 1, borderColor: ucapsaBrand.colors.redSoftStrong },
  memberNumberLabel: { color: ucapsaBrand.colors.redDark, fontSize: 11, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.7 },
  memberNumber: { color: ucapsaBrand.colors.text, fontSize: 26, fontWeight: '900', marginTop: 2 },
  infoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  infoBox: { width: '48%', padding: 12, borderRadius: 18, backgroundColor: withAlpha(ucapsaBrand.colors.surface, 0.94) },
  infoLabel: { color: ucapsaBrand.colors.redDark, fontSize: 10, fontWeight: '900', textTransform: 'uppercase' },
  infoValue: { color: ucapsaBrand.colors.text, fontSize: 13, fontWeight: '900', marginTop: 4 },
  warningBox: { backgroundColor: ucapsaBrand.colors.goldPale, borderColor: ucapsaBrand.colors.gold, borderWidth: 1, borderRadius: 16, padding: 12 },
  warningText: { color: ucapsaBrand.colors.goldDark, fontSize: 13, lineHeight: 19, fontWeight: '800' },
  qrPanel: { alignItems: 'center', gap: 8, paddingTop: 4 },
  qrWhiteBox: { padding: 14, borderRadius: 22, backgroundColor: ucapsaBrand.colors.surface, borderWidth: 1, borderColor: ucapsaBrand.colors.premiumMuted },
  qrTitle: { color: ucapsaBrand.colors.surface, fontSize: 16, fontWeight: '900' },
  qrSubtitle: { maxWidth: 250, color: ucapsaBrand.colors.dangerBorder, textAlign: 'center', fontSize: 12, lineHeight: 18, fontWeight: '800' },
});
