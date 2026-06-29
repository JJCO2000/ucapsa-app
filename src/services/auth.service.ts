import { supabase } from '../lib/supabase';

type SignUpInput = {
  email: string;
  password: string;
  fullName: string;
};

export async function signInWithEmail(email: string, password: string) {
  return supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  });
}

export async function signUpWithEmail({ email, password, fullName }: SignUpInput) {
  return supabase.auth.signUp({
    email: email.trim(),
    password,
    options: {
      data: {
        full_name: fullName.trim(),
      },
    },
  });
}

export async function signOut() {
  return supabase.auth.signOut();
}

export async function getCurrentSession() {
  return supabase.auth.getSession();
}
