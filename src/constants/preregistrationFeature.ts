/**
 * Despliegue en dos fases: el código frontend puede integrarse antes que las
 * migraciones. Nadie llama a RPC nuevas hasta que se active deliberadamente
 * el acceso tras instalar el esquema, revisar RLS y actualizar los tipos.
 * No sustituye autorización de servidor o RLS.
 */
export const preregistrationEnabled =
  process.env.EXPO_PUBLIC_UCAPSA_PREREGISTRATION_ENABLED === 'true';
