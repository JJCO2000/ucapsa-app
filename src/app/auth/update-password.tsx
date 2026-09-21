import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { KeyboardAwareScreen } from '../../components/ui/KeyboardAwareScreen';
import { ucapsaBrand } from '../../constants/brand';
import {
  AUTH_PASSWORD_MIN_LENGTH,
  establishPasswordRecoverySession,
  updateCurrentUserPassword,
  validateNewPassword,
} from '../../services/auth.service';

export default function UpdatePasswordScreen() {
  const recoveryUrl = Linking.useLinkingURL();
  const [linkError, setLinkError] = useState<string | null>(null);
  const [linkReady, setLinkReady] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;

    if (!recoveryUrl) {
      setLinkReady(false);
      return () => {
        active = false;
      };
    }

    setLinkReady(false);
    setLinkError(null);

    void establishPasswordRecoverySession(recoveryUrl)
      .then(() => {
        if (active) setLinkReady(true);
      })
      .catch((error) => {
        if (!active) return;
        setLinkReady(false);
        setLinkError(
          error instanceof Error
            ? error.message
            : 'No se pudo validar el enlace de recuperación.',
        );
      });

    return () => {
      active = false;
    };
  }, [recoveryUrl]);

  async function savePassword() {
    const validationError = validateNewPassword(password);
    if (validationError) {
      Alert.alert('Contraseña no válida', validationError);
      return;
    }
    if (password !== confirmation) {
      Alert.alert('Las contraseñas no coinciden', 'Escribe la misma contraseña en ambos campos.');
      return;
    }

    try {
      setSaving(true);
      const { error } = await updateCurrentUserPassword(password);
      if (error) throw error;

      Alert.alert('Contraseña actualizada', 'Tu nueva contraseña ya está activa.');
      router.replace('/home');
    } catch (error) {
      Alert.alert(
        'No se pudo actualizar',
        error instanceof Error ? error.message : 'Solicita un nuevo enlace e intenta otra vez.',
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <KeyboardAwareScreen contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <Text style={styles.kicker}>UCAPSA APP</Text>
        <Text style={styles.title}>Nueva contraseña</Text>
        <Text style={styles.subtitle}>
          Abre esta pantalla desde el enlace que UCAPSA envió a tu correo.
        </Text>
      </View>

      <View style={styles.card}>
        {linkError ? (
          <>
            <Text style={styles.errorTitle}>El enlace no es válido</Text>
            <Text style={styles.errorText}>{linkError}</Text>
            <Pressable
              style={styles.secondaryButton}
              onPress={() => router.replace('/auth/forgot-password')}
            >
              <Text style={styles.secondaryButtonText}>Solicitar otro enlace</Text>
            </Pressable>
          </>
        ) : !linkReady ? (
          <>
            <Text style={styles.statusTitle}>Validando enlace...</Text>
            <Text style={styles.statusText}>
              Si abriste esta pantalla manualmente, vuelve a tu correo y toca el enlace de recuperación.
            </Text>
          </>
        ) : (
          <>
            <Text style={styles.label}>Nueva contraseña</Text>
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder={`Mínimo ${AUTH_PASSWORD_MIN_LENGTH} caracteres`}
              secureTextEntry
              textContentType="newPassword"
              style={styles.input}
              returnKeyType="next"
            />

            <Text style={styles.label}>Confirmar contraseña</Text>
            <TextInput
              value={confirmation}
              onChangeText={setConfirmation}
              placeholder="Repite la contraseña"
              secureTextEntry
              textContentType="newPassword"
              style={styles.input}
              returnKeyType="done"
              onSubmitEditing={savePassword}
            />

            <Pressable
              disabled={saving}
              style={[styles.primaryButton, saving && styles.disabled]}
              onPress={savePassword}
            >
              <Text style={styles.primaryButtonText}>
                {saving ? 'Guardando...' : 'Guardar nueva contraseña'}
              </Text>
            </Pressable>
          </>
        )}
      </View>
    </KeyboardAwareScreen>
  );
}

const styles = StyleSheet.create({
  container: { justifyContent: 'center', paddingTop: 36 },
  header: { marginBottom: 20 },
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
  label: { color: ucapsaBrand.colors.text, fontSize: 14, fontWeight: '900' },
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
  primaryButton: {
    marginTop: 8,
    minHeight: 54,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    backgroundColor: ucapsaBrand.colors.red,
  },
  primaryButtonText: {
    color: ucapsaBrand.colors.surface,
    fontSize: 16,
    fontWeight: '900',
  },
  secondaryButton: {
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: ucapsaBrand.colors.border,
    backgroundColor: ucapsaBrand.colors.surfaceAlt,
  },
  secondaryButtonText: {
    color: ucapsaBrand.colors.redDark,
    fontSize: 14,
    fontWeight: '900',
  },
  errorTitle: { color: ucapsaBrand.colors.danger, fontSize: 18, fontWeight: '900' },
  errorText: { color: ucapsaBrand.colors.muted, fontSize: 13, lineHeight: 19, fontWeight: '700' },
  statusTitle: { color: ucapsaBrand.colors.text, fontSize: 18, fontWeight: '900' },
  statusText: { color: ucapsaBrand.colors.muted, fontSize: 13, lineHeight: 19, fontWeight: '700' },
  disabled: { opacity: 0.55 },
});
