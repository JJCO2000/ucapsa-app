import { ucapsaBrand, withAlpha } from '../../constants/brand';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { ProgramEnrollmentWithDetails } from '../../types/app.types';
import {
  formatNextProgramClassLabel,
  formatScheduleLabel,
  getProgramEnrollmentDogName,
  getProgramLevelLabel,
  getProgramStatusLabel,
} from '../../services/programs.service';

type ProgramCredentialCardProps = {
  item: ProgramEnrollmentWithDetails;
  onPress?: () => void;
  compact?: boolean;
};

function getProgramTheme(code: string | null | undefined) {
  if (code === 'puppy') {
    return {
      background: ucapsaBrand.colors.gold,
      soft: ucapsaBrand.colors.goldPale,
      border: ucapsaBrand.colors.gold,
      text: ucapsaBrand.colors.premiumSurfaceAlt,
      muted: ucapsaBrand.colors.goldDark,
      accent: ucapsaBrand.colors.text,
      qr: ucapsaBrand.colors.premiumSurfaceAlt,
      icon: 'dog' as const,
      label: 'Puppy',
      glow: ucapsaBrand.colors.goldSoft,
    };
  }

  return {
    background: ucapsaBrand.colors.blueDark,
    soft: ucapsaBrand.colors.graySoft,
    border: ucapsaBrand.colors.textLight,
    text: ucapsaBrand.colors.surface,
    muted: ucapsaBrand.colors.borderNeutral,
    accent: ucapsaBrand.colors.grayDark,
    qr: ucapsaBrand.colors.blueDark,
    icon: 'school' as const,
    label: 'Comandos',
    glow: ucapsaBrand.colors.gray,
  };
}

export function ProgramCredentialCard({ item, onPress, compact = false }: ProgramCredentialCardProps) {
  const theme = getProgramTheme(item.program.code);
  const accentColor = theme.accent;
  const requiredAttendances = Math.max(1, item.program.required_attendances || 1);
  const currentAttendances = Math.max(0, item.enrollment.attendances_count || 0);
  const progressLabel = `${currentAttendances} / ${requiredAttendances}`;
  const progressPercent = Math.min(100, Math.round((currentAttendances / requiredAttendances) * 100));
  const levelLabel = item.program.code === 'comandos' ? getProgramLevelLabel(item.enrollment.program_level) : null;

  const content = (
    <View style={[styles.card, { backgroundColor: theme.background, borderColor: theme.border }]}>
      <View style={[styles.decorCircle, { backgroundColor: theme.glow }]} />
      <View style={styles.headerRow}>
        <View style={[styles.iconBox, { backgroundColor: theme.soft }]}>
          <MaterialCommunityIcons name={theme.icon} size={26} color={theme.qr} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.kicker, { color: theme.muted }]}>Credencial digital</Text>
          <Text style={[styles.title, { color: theme.text }]}>{theme.label}</Text>
          <Text style={[styles.subtitle, { color: theme.muted }]}>Perro: {getProgramEnrollmentDogName(item)}</Text>
        </View>
        {onPress ? <MaterialIcons name="chevron-right" size={26} color={theme.text} /> : null}
      </View>

      {levelLabel ? (
        <View style={styles.levelPill}>
          <MaterialCommunityIcons name="medal-outline" size={16} color={accentColor} />
          <Text style={[styles.levelText, { color: accentColor }]}>Nivel {levelLabel}</Text>
        </View>
      ) : null}

      <View style={styles.infoGrid}>
        <InfoBox label="Horario" value={formatScheduleLabel(item.schedule)} theme={theme} />
        <InfoBox label="Proxima clase" value={formatNextProgramClassLabel(item.schedule)} theme={theme} />
        <InfoBox label="Tarjeta fisica" value={item.enrollment.physical_card_number || 'Sin numero'} theme={theme} />
        <InfoBox label="Estado" value={getProgramStatusLabel(item.enrollment.status)} theme={theme} />
        <InfoBox label="Asistencias" value={progressLabel} theme={theme} />
        <InfoBox label="Ultima clase" value={item.enrollment.last_attendance_at || 'Sin registro'} theme={theme} />
      </View>

      <View style={styles.progressOuter}>
        <View style={[styles.progressInner, { width: `${progressPercent}%`, backgroundColor: theme.qr }]} />
      </View>

      {!compact ? (
        <View style={[styles.attendancePanel, { backgroundColor: theme.soft }]}>
          <MaterialCommunityIcons name="qrcode-scan" size={28} color={theme.accent} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.qrTitle, { color: theme.accent }]}>Asistencia con QR oficial</Text>
            <Text style={[styles.qrSubtitle, { color: theme.accent }]}>Escanea el QR fisico de UCAPSA desde Registrar asistencia. Esta credencial ya no genera un QR personal por perro.</Text>
          </View>
        </View>
      ) : null}
    </View>
  );

  if (!onPress) return content;
  return <Pressable onPress={onPress}>{content}</Pressable>;
}

function InfoBox({ label, value, theme }: { label: string; value: string; theme: ReturnType<typeof getProgramTheme> }) {
  return (
    <View style={[styles.infoBox, { backgroundColor: theme.soft }]}>
      <Text style={[styles.infoLabel, { color: theme.accent }]}>{label}</Text>
      <Text style={[styles.infoValue, { color: theme.accent }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { position: 'relative', overflow: 'hidden', gap: 14, borderRadius: 30, borderWidth: 1, padding: 18 },
  decorCircle: { position: 'absolute', right: -44, top: -44, width: 132, height: 132, borderRadius: 66, opacity: 0.35 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 13 },
  iconBox: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  kicker: { fontSize: 11, fontWeight: '900', letterSpacing: 0.7, textTransform: 'uppercase' },
  title: { fontSize: 26, fontWeight: '900', marginTop: 2 },
  subtitle: { fontSize: 13, fontWeight: '800', marginTop: 3 },
  levelPill: { alignSelf: 'flex-start', flexDirection: 'row', gap: 6, alignItems: 'center', borderRadius: 999, backgroundColor: withAlpha(ucapsaBrand.colors.surface, 0.86), paddingHorizontal: 12, paddingVertical: 7 },
  levelText: { fontSize: 12, fontWeight: '900' },
  infoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  infoBox: { width: '48%', borderRadius: 17, padding: 11 },
  infoLabel: { fontSize: 10, fontWeight: '900', textTransform: 'uppercase' },
  infoValue: { fontSize: 12, fontWeight: '900', marginTop: 3, lineHeight: 17 },
  progressOuter: { height: 10, overflow: 'hidden', borderRadius: 999, backgroundColor: withAlpha(ucapsaBrand.colors.surface, 0.65) },
  progressInner: { height: '100%', borderRadius: 999 },
  attendancePanel: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 18, padding: 14 },
  qrTitle: { fontSize: 15, fontWeight: '900' },
  qrSubtitle: { fontSize: 12, lineHeight: 17, fontWeight: '800' },
});
