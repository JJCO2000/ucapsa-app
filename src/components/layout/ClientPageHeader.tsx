import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { MemberClubCrest } from '../domain/MemberClubCrest';
import { ucapsaBrand, withAlpha } from '../../constants/brand';
import type { UcapsaFormat } from '../../constants/ucapsaFormats';

export function ClientPageHeader({
  format,
  eyebrow,
  title,
  subtitle,
  icon,
  right,
}: {
  format: UcapsaFormat;
  eyebrow: string;
  title: string;
  subtitle?: string;
  icon: keyof typeof MaterialIcons.glyphMap;
  right?: ReactNode;
}) {
  const club = format.key === 'member';
  const accent = club ? ucapsaBrand.colors.redDeep : format.accentDark;

  return (
    <View style={[styles.header, club && styles.clubHeader]}>
      <View style={styles.topRow}>
        {club ? (
          <MemberClubCrest compact />
        ) : (
          <View style={[styles.iconBox, { backgroundColor: format.accentSoft, borderColor: format.border }]}>
            <MaterialIcons name={icon} size={22} color={accent} />
          </View>
        )}
        <View style={styles.copy}>
          <Text style={[styles.eyebrow, { color: club ? ucapsaBrand.colors.premiumAction : accent }]}>{club ? 'CLUB UCAPSA' : eyebrow}</Text>
          <Text style={[styles.title, { color: format.text }]}>{title}</Text>
        </View>
        {right}
      </View>
      {subtitle ? <Text style={[styles.subtitle, { color: format.muted }]}>{subtitle}</Text> : null}
      {club ? (
        <View style={styles.clubSignatureRow}>
          <View style={[styles.clubSignatureDot, { backgroundColor: ucapsaBrand.colors.premiumAction }]} />
          <Text style={styles.clubSignatureText}>Experiencia de socio</Text>
          <View style={[styles.clubSignatureLine, { backgroundColor: withAlpha(ucapsaBrand.colors.premiumAction, 0.22) }]} />
        </View>
      ) : (
        <View style={[styles.rule, { backgroundColor: format.border }]} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { gap: 10, marginBottom: 18, paddingHorizontal: 2 },
  clubHeader: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: ucapsaBrand.colors.premiumBorder,
    backgroundColor: ucapsaBrand.colors.premiumHero,
    paddingHorizontal: 14,
    paddingVertical: 14,
    shadowColor: ucapsaBrand.colors.redDeep,
    shadowOpacity: 0.045,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 1,
  },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  iconBox: { width: 48, height: 48, borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  copy: { flex: 1, minWidth: 0 },
  eyebrow: { fontSize: 11, lineHeight: 15, fontWeight: '900', letterSpacing: 1.0, textTransform: 'uppercase' },
  title: { marginTop: 1, fontSize: 28, lineHeight: 34, fontWeight: '900', letterSpacing: -0.45 },
  subtitle: { fontSize: 14, lineHeight: 20, fontWeight: '700', paddingHorizontal: 2 },
  rule: { height: 1, marginTop: 2 },
  clubSignatureRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 1 },
  clubSignatureDot: { width: 6, height: 6, borderRadius: 3 },
  clubSignatureText: { color: ucapsaBrand.colors.premiumActionText, fontSize: 11, lineHeight: 15, fontWeight: '900', letterSpacing: 0.65, textTransform: 'uppercase' },
  clubSignatureLine: { flex: 1, height: 1 },
});
