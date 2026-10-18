import 'react-native-url-polyfill/auto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { createClient } from '@supabase/supabase-js';

import type { Database } from '../types/database.types';
import { devWarn } from './client-diagnostics';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

if (!supabaseUrl || !supabaseAnonKey) {
  devWarn('Missing Supabase env variables. Check EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in .env.');
}

// Double fail-closed guard: a reviewer AAB cannot silently connect to UCAPSA
// production if EAS preview variables are accidentally configured incorrectly.
if (process.env.EXPO_PUBLIC_UCAPSA_REVIEW_BUILD === 'true' &&
    (!supabaseUrl || new URL(supabaseUrl).hostname === 'hrfecmviyiluubymsoeq.supabase.co')) {
  throw new Error('Build de revision sin entorno de demostracion aislado.');
}

// Expo Router renderiza HTML estático dentro de Node, donde no existe window.
 // Una sesión de usuario nunca se persiste durante el prerender. En cliente,
 // navegadores, Android e iOS siguen usando AsyncStorage como antes.
const staticRenderStorage = {
  getItem: async (_key: string): Promise<string | null> => null,
  setItem: async (_key: string, _value: string): Promise<void> => {},
  removeItem: async (_key: string): Promise<void> => {},
};
const authStorage = Platform.OS === 'web' && typeof window === 'undefined'
  ? staticRenderStorage
  : AsyncStorage;

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: authStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
