import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import * as Clipboard from 'expo-clipboard';
import { useState } from 'react';
import { Platform, Pressable, Share, StyleSheet, Text } from 'react-native';

import { ucapsaBrand } from '../../constants/brand';
import { buildAchievementShareMessage } from '../../utils/achievement-sharing';

export function AchievementShareAction({ title, premium = false }: {
  title: string;
  premium?: boolean;
}) {
  const [sharing, setSharing] = useState(false);
  const [notice, setNotice] = useState('');

  async function share() {
    if (sharing) return;
    setSharing(true);
    setNotice('');
    try {
      const message = buildAchievementShareMessage(title);
      if (Platform.OS === 'web') {
        await Clipboard.setStringAsync(message);
        setNotice('Mensaje copiado. Compártelo donde prefieras.');
      } else {
        await Share.share({ message });
      }
    } catch {
      setNotice('No se pudo compartir. Inténtalo de nuevo.');
    } finally {
      setSharing(false);
    }
  }

  return (
    <>
      <Pressable accessibilityRole="button"
        accessibilityLabel={'Compartir medalla ' + title}
        disabled={sharing}
        onPress={() => { void share(); }}
        style={[styles.button, premium && styles.premiumButton, sharing && styles.disabled]}>
        <MaterialCommunityIcons
          name="share-variant-outline" size={20}
          color={premium ? ucapsaBrand.colors.premiumAction : ucapsaBrand.colors.redDark}
        />
        <Text style={[styles.buttonText, premium && styles.premiumText]}>
          {sharing ? 'Preparando…' : 'Compartir mi medalla'}
        </Text>
      </Pressable>
      {notice ? <Text accessibilityRole="alert" style={styles.notice}>{notice}</Text> : null}
    </>
  );
}

const styles = StyleSheet.create({
  button: {
    width: '100%', minHeight: 52, borderRadius: 16, paddingHorizontal: 12,
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 9,
    borderWidth: 1, borderColor: ucapsaBrand.colors.redDark,
    backgroundColor: ucapsaBrand.colors.surface,
  },
  premiumButton: {
    backgroundColor: ucapsaBrand.colors.premiumSurface,
    borderColor: ucapsaBrand.colors.premiumAction,
  },
  buttonText: { color: ucapsaBrand.colors.redDark, fontSize: 14, fontWeight: '900' },
  premiumText: { color: ucapsaBrand.colors.premiumAction },
  disabled: { opacity: 0.5 },
  notice: { color: ucapsaBrand.colors.redDark, fontSize: 12, textAlign: 'center', paddingVertical: 5 },
});