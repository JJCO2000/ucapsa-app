/**
 * Los códigos SMS pueden tener costo por envío.
 * Solo se habilita cuando UCAPSA contrate/configure explícitamente
 * un proveedor SMS en Supabase Auth y apruebe su gasto.
 *
 * Este flag no controla permisos; los valida Supabase en el servidor.
 */
export const phoneVerificationEnabled =
  process.env.EXPO_PUBLIC_UCAPSA_PHONE_OTP_ENABLED === 'true' &&
  process.env.EXPO_PUBLIC_UCAPSA_REVIEW_BUILD !== 'true' &&
  process.env.EXPO_PUBLIC_SUPABASE_URL?.replace(/\/$/, '') ===
    'https://hrfecmviyiluubymsoeq.supabase.co';
