import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { signUpWithEmail } from '../../services/auth.service';

export default function RegisterScreen() {
  const router = useRouter();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleRegister() {
    if (!fullName.trim() || !email.trim() || password.length < 6) {
      Alert.alert(
        'Missing data',
        'Write your full name, email and a password with at least 6 characters.'
      );
      return;
    }

    setSubmitting(true);
    const { data, error } = await signUpWithEmail({
      fullName,
      email,
      password,
    });
    setSubmitting(false);

    if (error) {
      Alert.alert('Register failed', error.message);
      return;
    }

    if (data.session) {
      router.replace('/home' as never);
      return;
    }

    Alert.alert(
      'Account created',
      'If email confirmation is enabled, check your inbox before logging in.'
    );
    router.replace('/auth/login' as never);
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.select({ ios: 'padding', android: undefined })}
      style={styles.container}
    >
      <View style={styles.card}>
        <Text style={styles.eyebrow}>UCAPSA</Text>
        <Text style={styles.title}>Crear cuenta</Text>
        <Text style={styles.subtitle}>
          Crea una cuenta como cliente. Despues podras solicitar membresia.
        </Text>

        <Text style={styles.label}>Nombre completo</Text>
        <TextInput
          onChangeText={setFullName}
          placeholder="Nombre completo"
          placeholderTextColor="#94a3b8"
          style={styles.input}
          value={fullName}
        />

        <Text style={styles.label}>Correo</Text>
        <TextInput
          autoCapitalize="none"
          keyboardType="email-address"
          onChangeText={setEmail}
          placeholder="correo@ejemplo.com"
          placeholderTextColor="#94a3b8"
          style={styles.input}
          value={email}
        />

        <Text style={styles.label}>Contrasena</Text>
        <TextInput
          onChangeText={setPassword}
          placeholder="Minimo 6 caracteres"
          placeholderTextColor="#94a3b8"
          secureTextEntry
          style={styles.input}
          value={password}
        />

        <Pressable
          disabled={submitting}
          onPress={handleRegister}
          style={({ pressed }) => [
            styles.primaryButton,
            pressed && styles.pressed,
            submitting && styles.disabled,
          ]}
        >
          {submitting ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text style={styles.primaryButtonText}>Crear cuenta</Text>
          )}
        </Pressable>

        <Pressable onPress={() => router.push('/auth/login' as never)}>
          <Text style={styles.link}>Ya tengo cuenta</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 28,
    padding: 24,
  },
  eyebrow: {
    color: '#0f766e',
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 1,
    marginBottom: 10,
  },
  title: {
    color: '#0f172a',
    fontSize: 30,
    fontWeight: '900',
    marginBottom: 8,
  },
  subtitle: {
    color: '#475569',
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 24,
  },
  label: {
    color: '#0f172a',
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 8,
  },
  input: {
    borderColor: '#cbd5e1',
    borderRadius: 14,
    borderWidth: 1,
    color: '#0f172a',
    fontSize: 16,
    marginBottom: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: '#0f766e',
    borderRadius: 16,
    justifyContent: 'center',
    minHeight: 52,
    marginTop: 8,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '900',
  },
  pressed: {
    opacity: 0.85,
  },
  disabled: {
    opacity: 0.7,
  },
  link: {
    color: '#0f766e',
    fontSize: 15,
    fontWeight: '900',
    marginTop: 20,
    textAlign: 'center',
  },
});
