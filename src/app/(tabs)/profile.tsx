import { router, Redirect } from 'expo-router';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { KeyboardAwareScreen } from '../../components/ui/KeyboardAwareScreen';
import { SocialLinksRow } from '../../components/ui/SocialLinksRow';
import { ucapsaBrand } from '../../constants/brand';
import { useSession } from '../../hooks/useSession';

const wordmark = require('../../../assets/images/brand/ucapsa-wordmark.png');

export default function ProfileScreen() {
  const { loading, user, isAdmin } = useSession();

  if (loading) {
    return (
      <KeyboardAwareScreen style={styles.screen}>
        <Text style={styles.title}>Perfil</Text>
        <Text style={styles.muted}>Cargando sesion...</Text>
      </KeyboardAwareScreen>
    );
  }

  if (user && isAdmin) return <Redirect href="/admin-more" />;
  if (user) return <Redirect href="/account-settings" />;

  return (
    <KeyboardAwareScreen style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        <Image source={wordmark} style={styles.wordmark} resizeMode="contain" />
        <Text style={styles.title}>Perfil</Text>
        <Text style={styles.muted}>Si ya entrenas con UCAPSA, entra para ver clases, asistencias, logros, perros y pagos.</Text>
      </View>

      <Pressable style={styles.primaryButton} onPress={() => router.push('/auth/login' as never)}>
        <Text style={styles.primaryButtonText}>Iniciar sesion</Text>
      </Pressable>

      <Pressable style={styles.secondaryButton} onPress={() => router.push('/auth/register' as never)}>
        <Text style={styles.secondaryButtonText}>Crear cuenta</Text>
      </Pressable>

      <Pressable style={styles.tertiaryButton} onPress={() => router.push('/services' as never)}>
        <Text style={styles.tertiaryButtonText}>Todavia no entreno con UCAPSA</Text>
      </Pressable>

      <SocialLinksRow premium={false} />
    </KeyboardAwareScreen>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: ucapsaBrand.colors.background },
  content: { gap: 14, paddingTop: 24 },
  hero: { alignItems: 'center', gap: 8, paddingVertical: 18 },
  wordmark: { width: 190, height: 70 },
  title: { color: ucapsaBrand.colors.text, fontSize: 28, fontWeight: '900' },
  muted: { color: ucapsaBrand.colors.muted, fontSize: 14, lineHeight: 20, textAlign: 'center' },
  primaryButton: {
    minHeight: 48,
    borderRadius: 14,
    backgroundColor: ucapsaBrand.colors.red,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  primaryButtonText: { color: ucapsaBrand.colors.surface, fontWeight: '900', fontSize: 15 },
  secondaryButton: {
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: ucapsaBrand.colors.border,
    backgroundColor: ucapsaBrand.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  secondaryButtonText: { color: ucapsaBrand.colors.redDark, fontWeight: '900', fontSize: 15 },
  tertiaryButton: { minHeight: 42, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },
  tertiaryButtonText: { color: ucapsaBrand.colors.muted, fontWeight: '800', fontSize: 14, textAlign: 'center' },
});
