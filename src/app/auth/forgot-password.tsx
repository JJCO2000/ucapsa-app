import { ucapsaBrand } from '../../constants/brand';
import { Link } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { KeyboardAwareScreen } from '../../components/ui/KeyboardAwareScreen';
import { supabase } from '../../lib/supabase';
import { DEFAULT_WRITE_TIMEOUT_MS, withOperationTimeout } from '../../utils/async.utils';

export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleResetPassword() {
    const cleanEmail = email.trim().toLowerCase();

    if (!cleanEmail) {
      Alert.alert('Falta correo', 'Escribe tu correo para recuperar tu contrasena.');
      return;
    }

    setLoading(true);
    try {
      const { error } = await withOperationTimeout(
        supabase.auth.resetPasswordForEmail(cleanEmail),
        DEFAULT_WRITE_TIMEOUT_MS,
        'auth-reset-password',
      );

      if (error) {
        Alert.alert('No se pudo enviar el correo', error.message);
        return;
      }

      Alert.alert('Correo enviado', 'Revisa tu correo para continuar.');
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
        <Text style={styles.title}>Recuperar contrasena</Text>
        <Text style={styles.subtitle}>Te enviaremos instrucciones al correo registrado.</Text>
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
          returnKeyType="done"
          onSubmitEditing={handleResetPassword}
        />

        <Pressable style={[styles.button, loading && styles.buttonDisabled]} onPress={handleResetPassword} disabled={loading}>
          <Text style={styles.buttonText}>{loading ? 'Enviando...' : 'Enviar instrucciones'}</Text>
        </Pressable>

        <Link href="/auth/login" style={styles.linkStrong}>Volver a iniciar sesion</Link>
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
    fontSize: 34,
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
  linkStrong: {
    marginTop: 8,
    color: ucapsaBrand.colors.text,
    fontSize: 16,
    fontWeight: '900',
    textAlign: 'center',
  },
});

