import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { StyleSheet, View } from 'react-native';

import { ucapsaBrand, withAlpha } from '../../constants/brand';
import type { UcapsaFormat } from '../../constants/ucapsaFormats';

type AmbientVariant = 'home' | 'services' | 'classes' | 'payments' | 'dog';

type Props = {
  format: UcapsaFormat;
  variant?: AmbientVariant;
};

const shifts: Record<AmbientVariant, number> = {
  home: 0,
  services: 34,
  classes: 70,
  payments: 106,
  dog: 142,
};

const clubPaws: Array<{ top: number; left?: number; right?: number; rotate: string; size: number }> = [
  { top: 96, left: 22, rotate: '-16deg', size: 20 },
  { top: 188, right: 28, rotate: '18deg', size: 16 },
  { top: 338, left: 46, rotate: '10deg', size: 14 },
  { top: 516, right: 44, rotate: '-18deg', size: 20 },
  { top: 704, left: 24, rotate: '16deg', size: 16 },
  { top: 862, right: 24, rotate: '-8deg', size: 14 },
];

/**
 * Fondo ambiental de la experiencia cliente.
 *
 * Club UCAPSA usa una textura muy discreta: marfil, halos dorados, líneas suaves
 * y huellas casi imperceptibles. La intención es “club”, no “dark mode”.
 */
export function UcapsaAmbientBackground({ format, variant = 'home' }: Props) {
  const club = format.key === 'member';
  const shift = shifts[variant];
  const accent = club ? ucapsaBrand.colors.premiumAction : format.accent;
  const wash = withAlpha(accent, club ? 0.09 : 0.035);
  const washStrong = withAlpha(club ? ucapsaBrand.colors.redDeep : accent, club ? 0.055 : 0.05);
  const ring = withAlpha(accent, club ? 0.18 : 0.075);

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <View style={[styles.topGlow, { top: -138 + shift * 0.08, right: -118, backgroundColor: wash }]} />
      <View style={[styles.sideGlow, { top: 398 + shift, left: -118, backgroundColor: washStrong }]} />
      <View style={[styles.ring, { top: 674 + shift * 0.35, right: -28, borderColor: ring }]} />
      <View style={[styles.footerGlow, { bottom: -168, left: -110, backgroundColor: wash }]} />

      {club ? (
        <>
          <View style={[styles.clubLine, styles.clubLineOne, { borderColor: withAlpha(ucapsaBrand.colors.premiumAction, 0.10) }]} />
          <View style={[styles.clubLine, styles.clubLineTwo, { borderColor: withAlpha(ucapsaBrand.colors.redDeep, 0.055) }]} />
          {clubPaws.map((paw, index) => (
            <View
              key={`club-paw-${index}`}
              style={[
                styles.clubPaw,
                {
                  top: paw.top + shift * 0.18,
                  left: paw.left,
                  right: paw.right,
                  transform: [{ rotate: paw.rotate }],
                },
              ]}
            >
              <MaterialCommunityIcons
                name="paw"
                size={paw.size}
                color={withAlpha(index % 2 === 0 ? ucapsaBrand.colors.premiumAction : ucapsaBrand.colors.redDeep, 0.075)}
              />
            </View>
          ))}
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  topGlow: { position: 'absolute', width: 330, height: 330, borderRadius: 165 },
  sideGlow: { position: 'absolute', width: 220, height: 220, borderRadius: 110 },
  ring: { position: 'absolute', width: 168, height: 168, borderRadius: 84, borderWidth: 1.2, backgroundColor: 'transparent' },
  footerGlow: { position: 'absolute', width: 350, height: 350, borderRadius: 175 },
  clubLine: { position: 'absolute', width: 350, height: 170, borderRadius: 180, borderWidth: 1.2, backgroundColor: 'transparent' },
  clubLineOne: { top: 248, right: -210, transform: [{ rotate: '-13deg' }] },
  clubLineTwo: { top: 760, left: -230, transform: [{ rotate: '11deg' }] },
  clubPaw: { position: 'absolute' },
});
