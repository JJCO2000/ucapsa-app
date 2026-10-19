/**
 * Activación después de desplegar las cinco migraciones en Supabase producción.
 * La instalación oficial se verificó antes de habilitar UCAPSA en producción.
 *
 * - Solo se activa automáticamente con la URL exacta del proyecto UCAPSA.
 * - El entorno de revisión de Google Play siempre permanece desactivado.
 * - La variable explícita 'false' permite detener la función en una build nueva.
 * - En entornos de desarrollo ajenos a UCAPSA la función sigue apagada.
 *
 * No sustituye los permisos comprobados dentro de las funciones PostgreSQL.
 */
const enabledExplicitly = process.env.EXPO_PUBLIC_UCAPSA_PREREGISTRATION_ENABLED === 'true';
const disabledExplicitly = process.env.EXPO_PUBLIC_UCAPSA_PREREGISTRATION_ENABLED === 'false';
const isProductionUcapsa =
  process.env.EXPO_PUBLIC_SUPABASE_URL?.replace(/\/$/, '') ===
  'https://hrfecmviyiluubymsoeq.supabase.co';
const isPlayReviewBuild = process.env.EXPO_PUBLIC_UCAPSA_REVIEW_BUILD === 'true';

export const preregistrationEnabled =
  !isPlayReviewBuild && !disabledExplicitly && (enabledExplicitly || isProductionUcapsa);

// RPC de directorio disponible solo tras migración y habilitación explícita.
// Evita llamar funciones inexistentes en instalaciones desfasadas.
export const preregistrationDirectoryEnabled =
  preregistrationEnabled &&
  process.env.EXPO_PUBLIC_UCAPSA_PREREGISTRATION_DIRECTORY_ENABLED === 'true';
