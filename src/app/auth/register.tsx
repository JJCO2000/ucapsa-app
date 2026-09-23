import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { ucapsaBrand } from '../../constants/brand';
import { UCAPSA_TERMS_VERSION } from '../../constants/legal';
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
  const [adultConfirmed, setAdultConfirmed] = useState(false);
  const [legalAccepted, setLegalAccepted] = useState(false);

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

    if (!cleanName || !cleanEmail || !password) {
      Alert.alert('Faltan datos', 'Escribe nombre, correo y contrasena.');
      return;
    }

    const passwordError = validateNewPassword(password);
    if (passwordError) {
      Alert.alert('Contrasena muy corta', passwordError);
      return;
    }

    if (!privacyChecked || !privacyNotice) {
      Alert.alert('Aviso no disponible', 'Necesitamos mostrarte el aviso de privacidad vigente antes de crear tu cuenta.');
      return;
    }
    if (!adultConfirmed) {
      Alert.alert('Mayoría de edad requerida', 'UCAPSA App permite crear cuentas únicamente a personas de 18 años o más.');
      return;
    }
    if (!legalAccepted) {
      Alert.alert('Falta aceptación', 'Lee y acepta el Aviso de Privacidad y los Términos de Uso para continuar.');
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
        isAdult: adultConfirmed,
        privacyNoticeVersion: privacyNotice.version,
        termsVersion: UCAPSA_TERMS_VERSION,
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

        {!privacyChecked ? (
          <View style={styles.privacyBox}>
            <Text style={styles.privacyTitle}>Aviso de privacidad</Text>
            <Text style={styles.privacyText}>Consultando información publicada...</Text>
          </View>
        ) : privacyNotice ? (
          <View style={styles.privacyBox}>
            <Text style={styles.privacyTitle}>Aviso de privacidad · Versión {privacyNotice.version}</Text>
            <Text style={styles.privacyText}>{privacyNotice.simplified_notice}</Text>
            <Link href="/privacy" style={styles.privacyLink}>Consultar aviso integral</Link>
          </View>
        ) : (
          <View style={[styles.privacyBox, styles.privacyWarning]}>
            <Text style={styles.privacyTitle}>Registro temporalmente no disponible</Text>
            <Text style={styles.privacyText}>
              {privacyLoadError
                ? 'No pudimos consultar el aviso de privacidad vigente. Revisa tu conexión e intenta de nuevo.'
                : 'UCAPSA debe publicar un aviso de privacidad vigente antes de permitir nuevas cuentas.'}
            </Text>
          </View>
        )}

        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: adultConfirmed }}
          style={styles.consentRow}
          onPress={() => setAdultConfirmed((value) => !value)}
        >
          <View style={[styles.checkbox, adultConfirmed && styles.checkboxChecked]}>
            {adultConfirmed ? <MaterialIcons name="check" size={17} color={ucapsaBrand.colors.surface} /> : null}
          </View>
          <Text style={styles.consentText}>Confirmo que tengo 18 años o más.</Text>
        </Pressable>

        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: legalAccepted }}
          style={styles.consentRow}
          onPress={() => setLegalAccepted((value) => !value)}
        >
          <View style={[styles.checkbox, legalAccepted && styles.checkboxChecked]}>
            {legalAccepted ? <MaterialIcons name="check" size={17} color={ucapsaBrand.colors.surface} /> : null}
          </View>
          <Text style={styles.consentText}>He leído y acepto el Aviso de Privacidad y los Términos de Uso.</Text>
        </Pressable>

        <View style={styles.legalLinks}>
          <Link href="/privacy" style={styles.privacyLink}>Aviso de Privacidad</Link>
          <Text style={styles.legalSeparator}>·</Text>
          <Link href="/terms" style={styles.privacyLink}>Términos de Uso</Link>
        </View>

        <Pressable
          style={[
            styles.button,
            (loading || !privacyNotice || !adultConfirmed || !legalAccepted) && styles.buttonDisabled,
          ]}
          onPress={handleRegister}
          disabled={loading || !privacyNotice || !adultConfirmed || !legalAccepted}
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
  consentRow: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: ucapsaBrand.colors.border,
    backgroundColor: ucapsaBrand.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    borderColor: ucapsaBrand.colors.red,
    backgroundColor: ucapsaBrand.colors.red,
  },
  consentText: {
    flex: 1,
    color: ucapsaBrand.colors.text,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '800',
  },
  legalLinks: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    flexWrap: 'wrap',
  },
  legalSeparator: {
    color: ucapsaBrand.colors.muted,
    fontWeight: '900',
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

