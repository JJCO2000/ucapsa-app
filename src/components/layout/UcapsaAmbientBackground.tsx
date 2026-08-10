import { StyleSheet, View } from 'react-native';
import type { UcapsaFormat } from '../../constants/ucapsaFormats';

type AmbientVariant = 'home' | 'services' | 'classes' | 'payments' | 'dog';

type Props = {
  format: UcapsaFormat;
  variant?: AmbientVariant;
};

function rgba(hex: string, alpha: number) {
  const value = hex.replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(value)) return `rgba(201,31,55,${alpha})`;
  const red = Number.parseInt(value.slice(0, 2), 16);
  const green = Number.parseInt(value.slice(2, 4), 16);
  const blue = Number.parseInt(value.slice(4, 6), 16);
  return `rgba(${red},${green},${blue},${alpha})`;
}

const shifts: Record<AmbientVariant, number> = {
  home: 0,
  services: 46,
  classes: 88,
  payments: 132,
  dog: 174,
};

export function UcapsaAmbientBackground({ format, variant = 'home' }: Props) {
  const premium = format.key === 'member';
  const shift = shifts[variant];
  const accentStrong = rgba(format.accent, premium ? 0.11 : 0.08);
  const accentSoft = rgba(format.accent, premium ? 0.065 : 0.045);
  const accentFaint = rgba(format.accent, premium ? 0.045 : 0.027);
  const darkSoft = rgba(format.accentDark, premium ? 0.09 : 0.035);
  const ring = rgba(format.accent, premium ? 0.22 : 0.13);
  const tiny = premium ? 'rgba(255,232,181,0.16)' : rgba(format.accentDark, 0.07);

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <View style={[styles.circleXL, { top: -118 + shift * 0.18, right: -126, backgroundColor: accentSoft }]} />
      <View style={[styles.ringLarge, { top: 40 + shift * 0.35, left: -92, borderColor: ring }]} />
      <View style={[styles.circleMedium, { top: 245 + shift, right: -52, backgroundColor: accentFaint }]} />
      <View style={[styles.circleSmall, { top: 380 + shift * 0.45, left: 28, backgroundColor: accentStrong }]} />
      <View style={[styles.ringMedium, { top: 555 + shift * 0.35, right: 20, borderColor: ring }]} />
      <View style={[styles.circleLarge, { top: 730 + shift * 0.55, left: -112, backgroundColor: darkSoft }]} />
      <View style={[styles.circleTiny, { top: 168 + shift * 0.5, right: 68, backgroundColor: tiny }]} />
      <View style={[styles.circleTiny2, { top: 485 + shift * 0.45, left: 78, backgroundColor: tiny }]} />
      <View style={[styles.circleTiny3, { top: 910 + shift * 0.3, right: 98, backgroundColor: tiny }]} />
      <View style={[styles.footerCircle, { bottom: -150, right: -92, backgroundColor: accentFaint }]} />
      <View style={[styles.footerRing, { bottom: 34, left: -56, borderColor: ring }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  circleXL: { position: 'absolute', width: 270, height: 270, borderRadius: 135 },
  circleLarge: { position: 'absolute', width: 224, height: 224, borderRadius: 112 },
  circleMedium: { position: 'absolute', width: 150, height: 150, borderRadius: 75 },
  circleSmall: { position: 'absolute', width: 74, height: 74, borderRadius: 37 },
  ringLarge: { position: 'absolute', width: 190, height: 190, borderRadius: 95, borderWidth: 2, backgroundColor: 'transparent' },
  ringMedium: { position: 'absolute', width: 112, height: 112, borderRadius: 56, borderWidth: 2, backgroundColor: 'transparent' },
  circleTiny: { position: 'absolute', width: 18, height: 18, borderRadius: 9 },
  circleTiny2: { position: 'absolute', width: 12, height: 12, borderRadius: 6 },
  circleTiny3: { position: 'absolute', width: 22, height: 22, borderRadius: 11 },
  footerCircle: { position: 'absolute', width: 286, height: 286, borderRadius: 143 },
  footerRing: { position: 'absolute', width: 126, height: 126, borderRadius: 63, borderWidth: 2, backgroundColor: 'transparent' },
});
