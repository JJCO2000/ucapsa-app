import { ucapsaBrand } from '../../constants/brand';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { KeyboardAwareScreen } from '../../components/ui/KeyboardAwareScreen';
import { signInWithEmail } from '../../services/auth.service';
import { DEFAULT_WRITE_TIMEOUT_MS, withOperationTimeout } from '../../utils/async.utils';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [missingEmail, setMissingEmail] = useState(false);
  const [missingPassword, setMissingPassword] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  async function handleLogin() {
    const cleanEmail = email.trim();

    setLoginError(null);
    setMissingEmail(!cleanEmail);
    setMissingPassword(!password);
    if (!cleanEmail || !password) return;

    setLoading(true);
    try {
      const { error } = await withOperationTimeout(
        signInWithEmail(cleanEmail, password),
        DEFAULT_WRITE_TIMEOUT_MS,
        'auth-login',
      );

      if (error) {
        if (Platform.OS === 'web') {
          setLoginError('No pudimos iniciar sesión. Revisa tu correo y contraseña o recupérala.');
          return;
        }
        Alert.alert(
          'No pudimos iniciar sesión',
          'Revisa tu correo y contraseña. Si es tu primera vez en UCAPSA, puedes crear una cuenta.',
          [
            { text: 'Reintentar', style: 'cancel' },
            { text: 'Recuperar contraseña', onPress: () => router.push('/auth/forgot-password' as never) },
            { text: 'Crear cuenta', onPress: () => router.push('/auth/register' as never) },
          ],
        );
        return;
      }

      router.replace('/home');
    } catch {
      if (Platform.OS === 'web') setLoginError('No se pudo conectar. Revisa tu conexión e intenta de nuevo.');
      else Alert.alert('No se pudo conectar', 'Revisa tu conexion e intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAwareScreen contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <Text style={styles.kicker}>UCAPSA APP</Text>
        <Text style={styles.title}>Iniciar sesion</Text>
        <Text style={styles.subtitle}>Accede para ver tu perfil, calendario y comunicacion oficial.</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Correo</Text>
        <TextInput
          value={email}
          onChangeText={(value) => { setEmail(value); if (value.trim()) setMissingEmail(false); }}
          accessibilityLabel="Correo electrónico"
          accessibilityHint="Correo necesario para iniciar sesión"
          placeholder="correo@ejemplo.com"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          textContentType="emailAddress"
          style={styles.input}
          returnKeyType="next"
        />
        {missingEmail ? (
          <Text accessibilityRole="alert" style={styles.inlineError}>Escribe tu correo electrónico.</Text>
        ) : null}

        <Text style={styles.label}>Contrasena</Text>
        <TextInput
          value={password}
          onChangeText={(value) => { setPassword(value); if (value) setMissingPassword(false); }}
          accessibilityLabel="Contraseña"
          accessibilityHint="Contraseña necesaria para iniciar sesión"
          placeholder="Tu contrasena"
          secureTextEntry
          textContentType="password"
          style={styles.input}
          returnKeyType="done"
          onSubmitEditing={handleLogin}
        />
        {missingPassword ? (
          <Text accessibilityRole="alert" style={styles.inlineError}>Escribe tu contraseña.</Text>
        ) : null}

        {loginError ? <Text accessibilityRole="alert" style={styles.inlineError}>{loginError}</Text> : null}
        <Pressable style={[styles.button, loading && styles.buttonDisabled]} onPress={handleLogin} disabled={loading}>
          <Text style={styles.buttonText}>{loading ? 'Entrando...' : 'Entrar'}</Text>
        </Pressable>

        <Pressable accessibilityRole="button" onPress={() => router.push('/auth/forgot-password')}
          style={styles.secondaryAction}>
          <Text style={styles.link}>Olvidé mi contraseña</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => router.push('/auth/register')}
          style={styles.secondaryAction}>
          <Text style={styles.linkStrong}>Crear cuenta</Text>
        </Pressable>
      </View>
    </KeyboardAwareScreen>
  );
}

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    paddingTop: 36,
  },
  header: {
    marginBottom: 20,
  },
  kicker: {
    color: ucapsaBrand.colors.red,
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  title: {
    marginTop: 10,
    color: ucapsaBrand.colors.text,
    fontSize: 36,
    fontWeight: '900',
  },
  subtitle: {
    marginTop: 10,
    color: ucapsaBrand.colors.muted,
    fontSize: 17,
    fontWeight: '700',
    lineHeight: 24,
  },
  card: {
    gap: 12,
    borderRadius: 28,
    backgroundColor: ucapsaBrand.colors.surface,
    padding: 20,
    borderWidth: 1,
    borderColor: ucapsaBrand.colors.border,
  },
  inlineError: {
    color: ucapsaBrand.colors.danger,
    fontSize: 14,
    fontWeight: '800',
  },
  secondaryAction: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    color: ucapsaBrand.colors.text,
    fontSize: 14,
    fontWeight: '900',
  },
  input: {
    minHeight: 52,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: ucapsaBrand.colors.border,
    paddingHorizontal: 14,
    color: ucapsaBrand.colors.text,
    fontSize: 16,
    fontWeight: '700',
    backgroundColor: ucapsaBrand.colors.redPale,
  },
  button: {
    marginTop: 8,
    minHeight: 54,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    backgroundColor: ucapsaBrand.colors.red,
  },
  buttonDisabled: {
    opacity: 0.55,
  },
  buttonText: {
    color: ucapsaBrand.colors.surface,
    fontSize: 17,
    fontWeight: '900',
  },
  link: {
    marginTop: 8,
    color: ucapsaBrand.colors.red,
    fontSize: 15,
    fontWeight: '800',
    textAlign: 'center',
  },
  linkStrong: {
    color: ucapsaBrand.colors.text,
    fontSize: 16,
    fontWeight: '900',
    textAlign: 'center',
  },
});

