import { ucapsaBrand } from '../../constants/brand';
import { Link, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { KeyboardAwareScreen } from '../../components/ui/KeyboardAwareScreen';
import { AUTH_PASSWORD_MIN_LENGTH, signUpWithEmail, validateNewPassword } from '../../services/auth.service';
import { getPublishedPrivacyNotice, type PrivacyNotice } from '../../services/privacy-notice.service';

export default function RegisterScreen() {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [privacyNotice, setPrivacyNotice] = useState<PrivacyNotice | null>(null);
  const [privacyChecked, setPrivacyChecked] = useState(false);
  const [privacyLoadError, setPrivacyLoadError] = useState(false);

  useEffect(() => {
    let active = true;
    void getPublishedPrivacyNotice()
      .then((notice) => {
        if (!active) return;
        setPrivacyNotice(notice);
        setPrivacyLoadError(false);
      })
      .catch(() => {
        if (!active) return;
        setPrivacyNotice(null);
        setPrivacyLoadError(true);
      })
      .finally(() => {
        if (active) setPrivacyChecked(true);
      });

    return () => {
      active = false;
    };
  }, []);

  async function handleRegister() {
    const cleanName = fullName.trim();
    const cleanEmail = email.trim();

    if (!privacyNotice) {
      Alert.alert(
        'Aviso de privacidad no disponible',
        privacyLoadError
          ? 'No se pudo verificar el aviso publicado. Intenta de nuevo cuando tengas conexión.'
          : 'UCAPSA debe publicar el aviso de privacidad antes de crear nuevas cuentas.',
      );
      return;
    }

    if (!cleanName || !cleanEmail || !password) {
      Alert.alert('Faltan datos', 'Escribe nombre, correo y contrasena.');
      return;
    }

    const passwordError = validateNewPassword(password);
    if (passwordError) {
      Alert.alert('Contrasena muy corta', passwordError);
      return;
    }

    setLoading(true);
    try {
      // Crear una cuenta no usa un timeout artificial: Promise.race no cancela
      // una escritura ya enviada y podria reportar fallo aunque el alta termine despues.
      const { error } = await signUpWithEmail({
        email: cleanEmail,
        password,
        fullName: cleanName,
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
          placeholder={`Minimo ${AUTH_PASSWORD_MIN_LENGTH} caracteres`}
          secureTextEntry
          textContentType="newPassword"
          style={styles.input}
          returnKeyType="done"
          onSubmitEditing={handleRegister}
        />

        <View style={[styles.privacyBox, privacyChecked && !privacyNotice && styles.privacyWarning]}>
          <Text style={styles.privacyTitle}>
            {privacyNotice ? `Aviso de privacidad · Versión ${privacyNotice.version}` : 'Aviso de privacidad'}
          </Text>
          <Text style={styles.privacyText}>
            {!privacyChecked
              ? 'Consultando el aviso publicado...'
              : privacyNotice
                ? privacyNotice.simplified_notice
                : privacyLoadError
                  ? 'No se pudo verificar el aviso publicado. La creación de cuentas queda deshabilitada hasta poder consultarlo.'
                  : 'UCAPSA aún no tiene un aviso de privacidad publicado. La creación de cuentas queda deshabilitada hasta publicar la versión jurídica aprobada.'}
          </Text>
          <Link href="/privacy" style={styles.privacyLink}>Consultar aviso integral</Link>
        </View>

        <Pressable
          style={[styles.button, (loading || !privacyNotice) && styles.buttonDisabled]}
          onPress={handleRegister}
          disabled={loading || !privacyNotice}
        >
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
  privacyBox: {
    gap: 5,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: ucapsaBrand.colors.border,
    backgroundColor: ucapsaBrand.colors.surfaceAlt,
    padding: 12,
  },
  privacyWarning: {
    borderColor: ucapsaBrand.colors.redBorder,
    backgroundColor: ucapsaBrand.colors.redSoft,
  },
  privacyTitle: {
    color: ucapsaBrand.colors.text,
    fontSize: 12,
    fontWeight: '900',
  },
  privacyText: {
    color: ucapsaBrand.colors.muted,
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '700',
  },
  privacyLink: {
    color: ucapsaBrand.colors.redDark,
    fontSize: 12,
    fontWeight: '900',
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

