import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { StyleSheet, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { MemberClubCrest } from './MemberClubCrest';
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
  const statusLabel = expiredByDate ? 'Vigencia por revisar' : 'Socio activo';

  return (
    <View style={styles.card}>
      <View style={styles.textureRingOne} />
      <View style={styles.textureRingTwo} />
      <View style={styles.texturePawOne}><MaterialCommunityIcons name="paw" size={34} color={withAlpha(ucapsaBrand.colors.premiumAction, 0.08)} /></View>
      <View style={styles.texturePawTwo}><MaterialCommunityIcons name="paw" size={26} color={withAlpha(ucapsaBrand.colors.redDeep, 0.055)} /></View>

      <View style={styles.band}>
        <View style={styles.bandCopy}>
          <Text style={styles.bandEyebrow}>SOCIO UCAPSA</Text>
          <Text style={styles.bandTitle}>Club UCAPSA</Text>
        </View>
        <MemberClubCrest />
      </View>

      <View style={styles.body}>
        <View style={styles.identityBlock}>
          <Text style={styles.memberName}>{displayName}</Text>
          <View style={styles.memberMetaRow}>
            <View style={styles.memberNumberPill}>
              <Text style={styles.memberNumberLabel}>SOCIO</Text>
              <Text style={styles.memberNumber}>{membership.member_number || 'Pendiente'}</Text>
            </View>
            <View style={styles.statusPill}>
              <View style={[styles.statusDot, { backgroundColor: expiredByDate ? ucapsaBrand.colors.warning : ucapsaBrand.colors.premiumAction }]} />
              <Text style={styles.statusText}>{statusLabel}</Text>
            </View>
          </View>
        </View>

        <View style={styles.infoGrid}>
          <Info label="Inicio" value={formatDate(membership.start_date)} />
          <Info label="Vigencia" value={formatDate(membership.end_date)} />
        </View>

        <View style={styles.accessDivider}>
          <View style={styles.accessDividerLine} />
          <Text style={styles.accessDividerText}>CREDENCIAL DIGITAL</Text>
          <View style={styles.accessDividerLine} />
        </View>

        <View style={styles.qrPanel}>
          <View style={styles.qrWhiteBox}>
            <QRCode value={`ucapsa-member:${membership.qr_token}`} size={164} />
          </View>
          <View style={styles.qrCopy}>
            <Text style={styles.qrTitle}>QR de identificación</Text>
            <Text style={styles.qrSubtitle}>Este QR identifica tu membresía. Para registrar una visita, abre “Registrar visita” y escanea el QR oficial de Socios en UCAPSA.</Text>
          </View>
        </View>
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
  card: {
    position: 'relative',
    overflow: 'hidden',
    borderRadius: 30,
    backgroundColor: ucapsaBrand.colors.premiumSurface,
    borderWidth: 1,
    borderColor: ucapsaBrand.colors.premiumBorderStrong,
    shadowColor: ucapsaBrand.colors.redDeep,
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 7 },
    elevation: 3,
  },
  textureRingOne: { position: 'absolute', width: 190, height: 190, borderRadius: 95, borderWidth: 1, borderColor: withAlpha(ucapsaBrand.colors.premiumAction, 0.11), right: -92, top: 118 },
  textureRingTwo: { position: 'absolute', width: 130, height: 130, borderRadius: 65, borderWidth: 1, borderColor: withAlpha(ucapsaBrand.colors.redDeep, 0.055), left: -68, bottom: 112 },
  texturePawOne: { position: 'absolute', right: 24, bottom: 20, transform: [{ rotate: '-18deg' }] },
  texturePawTwo: { position: 'absolute', left: 24, top: 122, transform: [{ rotate: '18deg' }] },
  band: { minHeight: 104, paddingHorizontal: 18, paddingVertical: 17, flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: ucapsaBrand.colors.redDeep },
  bandCopy: { flex: 1 },
  bandEyebrow: { color: ucapsaBrand.colors.premiumActionSoft, fontSize: 10, fontWeight: '900', letterSpacing: 1.2 },
  bandTitle: { color: ucapsaBrand.colors.surface, fontSize: 27, lineHeight: 31, fontWeight: '900', marginTop: 3, letterSpacing: -0.4 },
  body: { gap: 15, padding: 18 },
  identityBlock: { gap: 9 },
  memberName: { color: ucapsaBrand.colors.premiumText, fontSize: 23, lineHeight: 28, fontWeight: '900', letterSpacing: -0.3 },
  memberMetaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  memberNumberPill: { flexDirection: 'row', alignItems: 'center', gap: 7, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 7, backgroundColor: ucapsaBrand.colors.premiumSurfaceAlt, borderWidth: 1, borderColor: ucapsaBrand.colors.premiumBorder },
  memberNumberLabel: { color: ucapsaBrand.colors.premiumActionText, fontSize: 9, fontWeight: '900', letterSpacing: 0.8 },
  memberNumber: { color: ucapsaBrand.colors.premiumText, fontSize: 12, fontWeight: '900' },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 7, backgroundColor: ucapsaBrand.colors.premiumHero, borderWidth: 1, borderColor: ucapsaBrand.colors.premiumBorder },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusText: { color: ucapsaBrand.colors.premiumActionText, fontSize: 10, fontWeight: '900' },
  infoGrid: { flexDirection: 'row', gap: 9 },
  infoBox: { flex: 1, padding: 12, borderRadius: 18, backgroundColor: ucapsaBrand.colors.premiumHero, borderWidth: 1, borderColor: ucapsaBrand.colors.premiumBorder },
  infoLabel: { color: ucapsaBrand.colors.premiumMuted, fontSize: 9, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.7 },
  infoValue: { color: ucapsaBrand.colors.premiumText, fontSize: 13, fontWeight: '900', marginTop: 4 },
  accessDivider: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 1 },
  accessDividerLine: { flex: 1, height: 1, backgroundColor: ucapsaBrand.colors.premiumBorder },
  accessDividerText: { color: ucapsaBrand.colors.premiumAction, fontSize: 9, fontWeight: '900', letterSpacing: 1.0 },
  qrPanel: { alignItems: 'center', gap: 10, paddingVertical: 4 },
  qrWhiteBox: { padding: 13, borderRadius: 22, backgroundColor: ucapsaBrand.colors.surface, borderWidth: 1, borderColor: ucapsaBrand.colors.premiumBorderStrong, shadowColor: ucapsaBrand.colors.redDeep, shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 1 },
  qrCopy: { alignItems: 'center', maxWidth: 280 },
  qrTitle: { color: ucapsaBrand.colors.premiumText, fontSize: 16, fontWeight: '900' },
  qrSubtitle: { marginTop: 3, color: ucapsaBrand.colors.premiumMuted, textAlign: 'center', fontSize: 11, lineHeight: 17, fontWeight: '700' },
});
