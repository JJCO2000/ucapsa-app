import { ucapsaBrand } from '../../constants/brand';
import { Link } from 'expo-router';
import { useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { KeyboardAwareScreen } from '../../components/ui/KeyboardAwareScreen';
import { resetPasswordForEmail } from '../../services/auth.service';
import { DEFAULT_WRITE_TIMEOUT_MS, withOperationTimeout } from '../../utils/async.utils';

export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function handleResetPassword() {
    const cleanEmail = email.trim();
    setFeedback(null);
    setSent(false);

    if (!cleanEmail) {
      if (Platform.OS === 'web') setFeedback('Escribe tu correo para recuperar tu contraseña.');
      else Alert.alert('Falta correo', 'Escribe tu correo para recuperar tu contrasena.');
      return;
    }

    setLoading(true);
    try {
      const { error } = await withOperationTimeout(
        resetPasswordForEmail(cleanEmail),
        DEFAULT_WRITE_TIMEOUT_MS,
        'auth-reset-password',
      );

      if (error) {
        if (Platform.OS === 'web') setFeedback('No se pudo enviar el correo. Comprueba tu conexión e inténtalo de nuevo.');
        else Alert.alert('No se pudo enviar el correo', error.message);
        return;
      }

      if (Platform.OS === 'web') {
        setSent(true);
        setFeedback('Si el correo está registrado, recibirás un enlace para restablecer tu contraseña.');
      } else Alert.alert('Correo enviado', 'Revisa tu correo para continuar.');
    } catch {
      if (Platform.OS === 'web') setFeedback('No se pudo conectar. Revisa tu conexión e intenta de nuevo.');
      else Alert.alert('No se pudo conectar', 'Revisa tu conexion e intenta de nuevo.');
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

        {feedback ? (
          <Text accessibilityRole={sent ? 'text' : 'alert'} style={[styles.feedback, sent && styles.feedbackSuccess]}>{feedback}</Text>
        ) : null}
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
  feedback: { color: ucapsaBrand.colors.danger, fontSize: 14, fontWeight: '700' },
  feedbackSuccess: { color: ucapsaBrand.colors.greenDark },
  linkStrong: {
    marginTop: 8,
    color: ucapsaBrand.colors.text,
    fontSize: 16,
    fontWeight: '900',
    textAlign: 'center',
  },
});

