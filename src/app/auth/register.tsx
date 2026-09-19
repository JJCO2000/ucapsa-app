import { Link, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { KeyboardAwareScreen } from '../../components/ui/KeyboardAwareScreen';
import { ucapsaBrand } from '../../constants/brand';
import { AUTH_PASSWORD_MIN_LENGTH, signUpWithEmail, validateNewPassword } from '../../services/auth.service';
import { getPublishedPrivacyNotice, type PrivacyNotice } from '../../services/privacy-notice.service';

export default function RegisterScreen() {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [privacyNotice, setPrivacyNotice] = useState<PrivacyNotice | null>(null);
  const [privacyLoading, setPrivacyLoading] = useState(true);
  const [privacyError, setPrivacyError] = useState<string | null>(null);

  async function loadPrivacyNotice() {
    setPrivacyLoading(true);
    try {
      const notice = await getPublishedPrivacyNotice();
      setPrivacyNotice(notice);
      setPrivacyError(null);
    } catch {
      setPrivacyNotice(null);
      setPrivacyError('No pudimos verificar el aviso publicado.');
    } finally {
      setPrivacyLoading(false);
    }
  }

  useEffect(() => {
    void loadPrivacyNotice();
  }, []);

  async function handleRegister() {
    if (!privacyNotice) {
      Alert.alert(
        'Registro temporalmente no disponible',
        'UCAPSA debe publicar su aviso de privacidad antes de crear nuevas cuentas.',
      );
      return;
    }

    const cleanName = fullName.trim();
    const cleanEmail = email.trim();

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
      // Revalidar justo antes del alta evita crear una cuenta contra una version
      // retirada o sustituida mientras la persona llenaba el formulario.
      const latestNotice = await getPublishedPrivacyNotice();

      if (!latestNotice) {
        setPrivacyNotice(null);
        Alert.alert(
          'Registro temporalmente no disponible',
          'El aviso de privacidad ya no esta publicado. Intenta de nuevo cuando UCAPSA publique una version vigente.',
        );
        return;
      }

      if (latestNotice.id !== privacyNotice.id) {
        setPrivacyNotice(latestNotice);
        Alert.alert(
          'El aviso de privacidad cambio',
          'Revisa la version vigente antes de continuar con el registro.',
        );
        return;
      }

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
      Alert.alert(
        'No se pudo conectar',
        'No pudimos verificar el aviso o crear la cuenta. Revisa tu conexion e intenta de nuevo.',
      );
    } finally {
      setLoading(false);
    }
  }

  const registrationAvailable = Boolean(privacyNotice && !privacyLoading && !privacyError);

  return (
    <KeyboardAwareScreen contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <Text style={styles.kicker}>UCAPSA APP</Text>
        <Text style={styles.title}>Crear cuenta</Text>
        <Text style={styles.subtitle}>
          Crea tu cuenta para llevar clases, asistencias, logros y pagos de tus perros en un solo lugar.
        </Text>
      </View>

      {privacyLoading ? (
        <View style={styles.statusCard}>
          <ActivityIndicator color={ucapsaBrand.colors.red} />
          <View style={styles.statusTextBox}>
            <Text style={styles.statusTitle}>Verificando privacidad</Text>
            <Text style={styles.statusText}>
              Antes de pedir tus datos, comprobamos que exista un aviso publicado.
            </Text>
          </View>
        </View>
      ) : null}

      {!privacyLoading && !registrationAvailable ? (
        <View style={styles.blockedCard}>
          <Text style={styles.statusTitle}>Registro temporalmente no disponible</Text>
          <Text style={styles.statusText}>
            {privacyError ??
              'UCAPSA todavia no ha publicado su aviso de privacidad en la app. No pediremos tus datos hasta que exista una version vigente.'}
          </Text>
          <Pressable style={styles.retryButton} onPress={() => void loadPrivacyNotice()}>
            <Text style={styles.retryText}>Reintentar verificacion</Text>
          </Pressable>
        </View>
      ) : null}

      {registrationAvailable && privacyNotice ? (
        <>
          <View style={styles.privacyCard}>
            <Text style={styles.privacyTitle}>Aviso simplificado · version {privacyNotice.version}</Text>
            <Text style={styles.privacyText}>{privacyNotice.simplified_notice}</Text>
            <Pressable style={styles.privacyLink} onPress={() => router.push('/privacy')}>
              <Text style={styles.privacyLinkText}>Consultar aviso integral</Text>
            </Pressable>
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

            <Pressable
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={handleRegister}
              disabled={loading}
            >
              <Text style={styles.buttonText}>{loading ? 'Creando...' : 'Crear cuenta'}</Text>
            </Pressable>
          </View>
        </>
      ) : null}

      <View style={styles.links}>
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
  statusCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: ucapsaBrand.colors.border,
    backgroundColor: ucapsaBrand.colors.surface,
    padding: 16,
  },
  blockedCard: {
    gap: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: ucapsaBrand.colors.redBorder,
    backgroundColor: ucapsaBrand.colors.redSoft,
    padding: 16,
  },
  statusTextBox: {
    flex: 1,
  },
  statusTitle: {
    color: ucapsaBrand.colors.text,
    fontSize: 15,
    fontWeight: '900',
  },
  statusText: {
    color: ucapsaBrand.colors.muted,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 18,
  },
  retryButton: {
    alignSelf: 'flex-start',
    marginTop: 4,
    borderRadius: 12,
    backgroundColor: ucapsaBrand.colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  retryText: {
    color: ucapsaBrand.colors.redDark,
    fontSize: 12,
    fontWeight: '900',
  },
  privacyCard: {
    gap: 9,
    marginBottom: 12,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: ucapsaBrand.colors.redBorder,
    backgroundColor: ucapsaBrand.colors.redSoft,
    padding: 16,
  },
  privacyTitle: {
    color: ucapsaBrand.colors.redDark,
    fontSize: 13,
    fontWeight: '900',
  },
  privacyText: {
    color: ucapsaBrand.colors.text,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 18,
  },
  privacyLink: {
    alignSelf: 'flex-start',
    minHeight: 40,
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: ucapsaBrand.colors.surface,
    paddingHorizontal: 12,
  },
  privacyLinkText: {
    color: ucapsaBrand.colors.redDark,
    fontSize: 12,
    fontWeight: '900',
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
  links: {
    gap: 10,
    marginTop: 16,
  },
  linkSoft: {
    color: ucapsaBrand.colors.muted,
    fontSize: 14,
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
