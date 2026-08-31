import { ucapsaBrand } from '../../constants/brand';
import { Link, router } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { KeyboardAwareScreen } from '../../components/ui/KeyboardAwareScreen';
import { supabase } from '../../lib/supabase';
import { DEFAULT_WRITE_TIMEOUT_MS, withOperationTimeout } from '../../utils/async.utils';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    const cleanEmail = email.trim().toLowerCase();

    if (!cleanEmail || !password) {
      Alert.alert('Faltan datos', 'Escribe tu correo y contrasena.');
      return;
    }

    setLoading(true);
    try {
      const { error } = await withOperationTimeout(
        supabase.auth.signInWithPassword({
          email: cleanEmail,
          password,
        }),
        DEFAULT_WRITE_TIMEOUT_MS,
        'auth-login',
      );

      if (error) {
        Alert.alert('No se pudo iniciar sesion', error.message);
        return;
      }

      router.replace('/home');
    } catch {
      Alert.alert('No se pudo conectar', 'Revisa tu conexion e intenta de nuevo.');
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
          onChangeText={setEmail}
          placeholder="correo@ejemplo.com"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          textContentType="emailAddress"
          style={styles.input}
          returnKeyType="next"
        />

        <Text style={styles.label}>Contrasena</Text>
        <TextInput
          value={password}
          onChangeText={setPassword}
          placeholder="Tu contrasena"
          secureTextEntry
          textContentType="password"
          style={styles.input}
          returnKeyType="done"
          onSubmitEditing={handleLogin}
        />

        <Pressable style={[styles.button, loading && styles.buttonDisabled]} onPress={handleLogin} disabled={loading}>
          <Text style={styles.buttonText}>{loading ? 'Entrando...' : 'Entrar'}</Text>
        </Pressable>

        <Link href="/auth/forgot-password" style={styles.link}>Olvide mi contrasena</Link>
        <Link href="/auth/register" style={styles.linkStrong}>Crear cuenta</Link>
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

