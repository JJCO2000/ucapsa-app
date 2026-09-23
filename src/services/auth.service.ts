import type { AuthChangeEvent, EmailOtpType, Session } from '@supabase/supabase-js';

import { supabase } from '../lib/supabase';

export const AUTH_PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_RECOVERY_REDIRECT_URL = 'ucapsaapp://auth/update-password';

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

export async function signUpWithEmail({
  email,
  password,
  fullName,
  isAdult,
  privacyNoticeVersion,
  termsVersion,
}: SignUpInput) {
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
    redirectTo: PASSWORD_RECOVERY_REDIRECT_URL,
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
