import type { AuthChangeEvent, Session } from '@supabase/supabase-js';

import { supabase } from '../lib/supabase';

export const AUTH_PASSWORD_MIN_LENGTH = 12;

type SignUpInput = {
  email: string;
  password: string;
  fullName: string;
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

export async function signUpWithEmail({ email, password, fullName }: SignUpInput) {
  return supabase.auth.signUp({
    email: normalizeAuthEmail(email),
    password,
    options: {
      data: {
        full_name: fullName.trim(),
      },
    },
  });
}

export async function resetPasswordForEmail(email: string) {
  return supabase.auth.resetPasswordForEmail(normalizeAuthEmail(email));
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
