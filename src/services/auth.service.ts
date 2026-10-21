import type { AuthChangeEvent, EmailOtpType, Session } from '@supabase/supabase-js';
import { Platform } from 'react-native';

import { supabase } from '../lib/supabase';
import { normalizeContactPhone } from '../utils/phone-contact';

export const AUTH_PASSWORD_MIN_LENGTH = 6;
export const PASSWORD_RECOVERY_REDIRECT_URL = 'ucapsaapp://auth/update-password';

// Web reset links return to the SAME current origin (preview/local/prod).
// Register each approved origin in Supabase Auth Redirect URLs before testing.
export function passwordRecoveryRedirectUrl() {
  if (Platform.OS !== 'web') return PASSWORD_RECOVERY_REDIRECT_URL;
  if (typeof window === 'undefined') {
    throw new Error('Se requiere un navegador para recuperar la contraseña por web.');
  }
  return new URL('/auth/update-password', window.location.origin).toString();
}

type SignUpInput = {
  email: string;
  password: string;
  fullName: string;
  isAdult: boolean;
  privacyNoticeVersion: string;
  termsVersion: string;
};

export function normalizeAuthEmail(email: string) {
  return email.trim().toLowerCase();
}

export function validateNewPassword(password: string): string | null {
  if (password.length < AUTH_PASSWORD_MIN_LENGTH) {
    return `Usa al menos ${AUTH_PASSWORD_MIN_LENGTH} caracteres.`;
  }
  return null;
}

export async function signInWithEmail(email: string, password: string) {
  return supabase.auth.signInWithPassword({
    email: normalizeAuthEmail(email),
    password,
  });
}

/** MVP: el celular de Perfil es un identificador; Supabase valida la contraseña.
 * No se generan cuentas, no se envía SMS ni se marca la línea como verificada.
 */
export async function signInWithVerifiedContact(contact: string, password: string) {
  const value = contact.trim();
  if (value.includes('@')) return signInWithEmail(value, password);
  const phone = normalizeContactPhone(value);
  const { data, error } = await supabase.functions.invoke<{
    access_token?: string;
    refresh_token?: string;
    user_id?: string;
  }>('phone-password-login', { body: { phone, password } });
  if (error || !data?.access_token || !data.refresh_token || !data.user_id) {
    return {
      data: { user: null, session: null },
      error: new Error('No pudimos iniciar sesión. Revisa el celular y la contraseña.'),
    };
  }
  const session = await supabase.auth.setSession({
    access_token: data.access_token,
    refresh_token: data.refresh_token,
  });
  if (!session.error && session.data.user?.id !== data.user_id) {
    await supabase.auth.signOut({ scope: 'local' });
    return {
      data: { user: null, session: null },
      error: new Error('No pudimos confirmar la identidad. Vuelve a intentarlo.'),
    };
  }
  return session;
}

export async function signUpWithEmail({
  email,
  password,
  fullName,
  isAdult,
  privacyNoticeVersion,
  termsVersion,
}: SignUpInput) {
  const passwordError = validateNewPassword(password);
  if (passwordError) throw new Error(passwordError);
  if (!isAdult) throw new Error('Debes confirmar que tienes 18 años o más.');
  const cleanPrivacyVersion = privacyNoticeVersion.trim();
  const cleanTermsVersion = termsVersion.trim();
  if (!cleanPrivacyVersion || !cleanTermsVersion) {
    throw new Error('No se pudo registrar la aceptación legal vigente.');
  }

  const acceptedAt = new Date().toISOString();
  return supabase.auth.signUp({
    email: normalizeAuthEmail(email),
    password,
    options: {
      data: {
        full_name: fullName.trim(),
        age_attested: true,
        age_attested_at: acceptedAt,
        privacy_notice_version: cleanPrivacyVersion,
        terms_version: cleanTermsVersion,
        legal_accepted_at: acceptedAt,
      },
    },
  });
}

export async function resetPasswordForEmail(email: string) {
  return supabase.auth.resetPasswordForEmail(normalizeAuthEmail(email), {
    redirectTo: passwordRecoveryRedirectUrl(),
  });
}

function readAuthUrlParams(url: string) {
  const params = new URLSearchParams();
  const queryAt = url.indexOf('?');
  const hashAt = url.indexOf('#');

  const queryEnd = hashAt >= 0 && hashAt > queryAt ? hashAt : url.length;
  if (queryAt >= 0) {
    const query = url.slice(queryAt + 1, queryEnd);
    for (const [key, value] of new URLSearchParams(query)) params.set(key, value);
  }

  if (hashAt >= 0) {
    const hash = url.slice(hashAt + 1);
    for (const [key, value] of new URLSearchParams(hash)) params.set(key, value);
  }

  return params;
}

export async function establishPasswordRecoverySession(url: string) {
  const params = readAuthUrlParams(url);
  const errorDescription = params.get('error_description') ?? params.get('error');
  if (errorDescription) throw new Error(errorDescription);

  const type = params.get('type');
  if (type && type !== 'recovery') {
    throw new Error('Este enlace no corresponde a recuperación de contraseña.');
  }

  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');
  if (accessToken && refreshToken) {
    const { data, error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    if (error) throw error;
    if (!data.session) throw new Error('El enlace de recuperación no creó una sesión válida.');
    return data.session;
  }

  const code = params.get('code');
  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) throw error;
    if (!data.session) throw new Error('El enlace de recuperación no creó una sesión válida.');
    return data.session;
  }

  const tokenHash = params.get('token_hash');
  if (tokenHash && type === 'recovery') {
    const { data, error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: type as EmailOtpType,
    });
    if (error) throw error;
    if (!data.session) throw new Error('El enlace de recuperación no creó una sesión válida.');
    return data.session;
  }

  // Never fall back to an unrelated already-authenticated session here.
  // This route is recovery-only and must prove recovery context from the link.
  throw new Error('El enlace de recuperación está incompleto o venció.');
}

export async function updateCurrentUserPassword(password: string) {
  const validationError = validateNewPassword(password);
  if (validationError) throw new Error(validationError);
  return supabase.auth.updateUser({ password });
}

export async function signOut() {
  return supabase.auth.signOut();
}

export async function signOutLocal() {
  return supabase.auth.signOut({ scope: 'local' });
}

export async function getCurrentSession() {
  return supabase.auth.getSession();
}

export function subscribeToAuthState(
  callback: (event: AuthChangeEvent, session: Session | null) => void,
) {
  return supabase.auth.onAuthStateChange(callback);
}
