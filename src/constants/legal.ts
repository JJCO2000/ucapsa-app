export const UCAPSA_TERMS_VERSION = '1.1';
export const UCAPSA_LEGAL_EFFECTIVE_DATE = '2026-09-22';
export const UCAPSA_PRIVACY_PUBLIC_URL =
  'https://hrfecmviyiluubymsoeq.supabase.co/functions/v1/privacy-policy';
export const UCAPSA_ACCOUNT_DELETION_PUBLIC_URL =
  'https://hrfecmviyiluubymsoeq.supabase.co/functions/v1/account-deletion-request';

export type LegalSection = {
  title: string;
  body: string;
};

export const UCAPSA_TERMS_SECTIONS: LegalSection[] = [
  {
    title: '1. Responsable del servicio',
    body:
      'UCAPSA App es operada por Universidad de Crianza y Adiestramiento Peruano, S.A. de C.V., con domicilio en Privada de Tetenco #5, Colonia San Miguel Topilejo, C.P. 14500, Alcaldía Tlalpan, Ciudad de México, México. Contacto: ucapsa84@gmail.com.',
  },
  {
    title: '2. Personas que pueden crear una cuenta',
    body:
      'La cuenta de UCAPSA App está dirigida a personas de 18 años o más. Al crear una cuenta declaras que tienes al menos 18 años. Las personas menores de edad no deben crear una cuenta propia en esta versión de la app.',
  },
  {
    title: '3. Cuenta y seguridad',
    body:
      'Debes proporcionar información correcta y mantener seguras tus credenciales. La cuenta es personal. UCAPSA puede adoptar medidas razonables para proteger el servicio, prevenir abuso y corregir accesos no autorizados.',
  },
  {
    title: '4. Finalidad de la app',
    body:
      'UCAPSA App es una herramienta operativa para consultar y administrar información relacionada con perros, clases, inscripciones, asistencias, prácticas, progreso, logros, membresías, visitas, eventos, avisos, notificaciones y registros administrativos de pagos.',
  },
  {
    title: '5. Registros de pagos',
    body:
      'Los registros de pagos dentro de la app son controles administrativos auxiliares para identificar si una membresía, clase u obligación fue registrada como pagada, pendiente o anulada. La app no procesa tarjetas ni sustituye comprobantes fiscales, CFDI, estados de cuenta o documentación contable que, en su caso, se emita o conserve por otros medios.',
  },
  {
    title: '6. QR, asistencias y progreso',
    body:
      'Los códigos QR y registros de asistencia se utilizan para operar accesos, clases, membresías y progreso. Los datos mostrados pueden depender de conectividad y sincronización. UCAPSA procurará mantener el historial consistente y corregir errores operativos cuando sean identificados.',
  },
  {
    title: '7. Notificaciones',
    body:
      'La app puede enviar notificaciones operativas sobre clases, anuncios, eventos, membresía y logros. Puedes modificar las categorías de notificaciones disponibles desde Ajustes. Las comunicaciones estrictamente necesarias para seguridad o administración de la cuenta pueden seguir mostrándose dentro de la app.',
  },
  {
    title: '8. Uso aceptable',
    body:
      'No debes intentar acceder a información de otras personas, alterar registros, abusar de códigos QR, eludir controles de seguridad, interferir con el funcionamiento de la app o utilizarla para fines ilícitos.',
  },
  {
    title: '9. Privacidad',
    body:
      'El tratamiento de datos personales se rige por el Aviso de Privacidad de UCAPSA App. La versión vigente puede consultarse dentro de la app en Ajustes > Aviso de privacidad y mediante la URL pública indicada por UCAPSA.',
  },
  {
    title: '10. Eliminación de cuenta',
    body:
      'Las cuentas de clientes y socios pueden iniciar su eliminación desde Ajustes > Eliminar cuenta. Si ya no tienen acceso a la app, también pueden iniciar la solicitud mediante el recurso web público de eliminación de UCAPSA. UCAPSA eliminará la cuenta y los datos asociados que no esté legalmente obligada a conservar. Si existe un impedimento legal o técnico para completar la eliminación de inmediato, la solicitud permanecerá registrada para su atención y se informará el estado correspondiente.',
  },
  {
    title: '11. Cambios',
    body:
      'UCAPSA puede actualizar estos términos cuando cambien las funciones, procesos o requisitos aplicables. La versión y fecha de vigencia se mostrarán en la app. El uso posterior a una actualización se sujetará a la versión vigente, sin limitar derechos que no puedan renunciarse conforme a la ley.',
  },
  {
    title: '12. Contacto',
    body:
      'Para dudas sobre la cuenta, estos términos o el funcionamiento de UCAPSA App, puedes escribir a ucapsa84@gmail.com.',
  },
];
