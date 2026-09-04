import { ucapsaBrand } from '../../constants/brand';
import { Link, router } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { KeyboardAwareScreen } from '../../components/ui/KeyboardAwareScreen';
import { supabase } from '../../lib/supabase';

export default function RegisterScreen() {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleRegister() {
    const cleanName = fullName.trim();
    const cleanEmail = email.trim().toLowerCase();

    if (!cleanName || !cleanEmail || !password) {
      Alert.alert('Faltan datos', 'Escribe nombre, correo y contrasena.');
      return;
    }

    if (password.length < 6) {
      Alert.alert('Contrasena muy corta', 'Usa al menos 6 caracteres.');
      return;
    }

    setLoading(true);
    try {
      // Crear una cuenta no usa un timeout artificial: Promise.race no cancela
      // una escritura ya enviada y podria reportar fallo aunque el alta termine despues.
      const { error } = await supabase.auth.signUp({
        email: cleanEmail,
        password,
        options: {
          data: {
            full_name: cleanName,
          },
        },
      });

      if (error) {
        Alert.alert('No se pudo crear la cuenta', error.message);
        return;
      }

      Alert.alert('Cuenta creada', 'Ya puedes entrar a UCAPSA App.');
      router.replace('/auth/login');
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
        <Text style={styles.title}>Crear cuenta</Text>
        <Text style={styles.subtitle}>Crea tu cuenta para llevar clases, asistencias, logros y pagos de tus perros en un solo lugar.</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Nombre completo</Text>
        <TextInput
          value={fullName}
          onChangeText={setFullName}
          placeholder="Tu nombre"
          autoCapitalize="words"
          textContentType="name"
          style={styles.input}
          returnKeyType="next"
        />

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
          placeholder="Minimo 6 caracteres"
          secureTextEntry
          textContentType="newPassword"
          style={styles.input}
          returnKeyType="done"
          onSubmitEditing={handleRegister}
        />

        <Pressable style={[styles.button, loading && styles.buttonDisabled]} onPress={handleRegister} disabled={loading}>
          <Text style={styles.buttonText}>{loading ? 'Creando...' : 'Crear cuenta'}</Text>
        </Pressable>

        <Link href="/auth/login" style={styles.linkStrong}>Ya tengo cuenta</Link>
        <Link href="/services" style={styles.linkSoft}>Todavia no entreno con UCAPSA</Link>
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
  linkSoft: {
    color: ucapsaBrand.colors.muted,
    fontSize: 14,
    fontWeight: '800',
    textAlign: 'center',
  },
  linkStrong: {
    marginTop: 8,
    color: ucapsaBrand.colors.text,
    fontSize: 16,
    fontWeight: '900',
    textAlign: 'center',
  },
});

