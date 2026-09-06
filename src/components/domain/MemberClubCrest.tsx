import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { StyleSheet, Text, View } from 'react-native';

import { ucapsaBrand, withAlpha } from '../../constants/brand';

export function MemberClubCrest({ compact = false }: { compact?: boolean }) {
  const size = compact ? 42 : 58;
  const crown = compact ? 18 : 22;
  return (
    <View style={[styles.wrap, { width: size, height: size, borderRadius: size / 2 }]}>
      <View style={[styles.inner, { borderRadius: size / 2 - 5 }]}>
        <MaterialCommunityIcons name="crown" size={crown} color={ucapsaBrand.colors.premiumAction} />
        {!compact ? <Text style={styles.ucapsa}>U</Text> : null}
      </View>
      <View style={styles.spark} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: ucapsaBrand.colors.premiumBorderStrong,
    backgroundColor: ucapsaBrand.colors.premiumSurface,
    shadowColor: ucapsaBrand.colors.redDeep,
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  inner: {
    width: '78%',
    height: '78%',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: withAlpha(ucapsaBrand.colors.premiumAction, 0.28),
    backgroundColor: ucapsaBrand.colors.premiumHero,
  },
  ucapsa: {
    position: 'absolute',
    bottom: 5,
    color: ucapsaBrand.colors.redDeep,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.7,
  },
  spark: {
    position: 'absolute',
    right: 2,
    top: 3,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: ucapsaBrand.colors.premiumAction,
    borderWidth: 2,
    borderColor: ucapsaBrand.colors.premiumSurface,
  },
});
