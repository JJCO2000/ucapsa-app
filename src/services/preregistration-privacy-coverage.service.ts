import {
  getPublishedPrivacyNotice,
  getPrivacyNoticeMissingFields,
  type PrivacyNotice,
} from './privacy-notice.service';

/**
 * A shared client-side fail-closed gate for Admin, Trainer and web/mobile.
 * This is NOT proof of delivery, third-party consent or server authorization.
 * The mandatory DB receipt/role guard must still be deployed with the reviewed
 * notice and the updated canonical intake RPCs.
 */
export function validateIntakeNoticeCoverage(notice: PrivacyNotice | null): string {
  if (!notice || notice.status !== 'published' || !notice.published_at
    || !notice.id || !notice.effective_from) {
    throw new Error('UCAPSA todavía no tiene un aviso vigente para preinscribir contactos. Solicita revisión de Administración.');
  }

  const effective = Date.parse(notice.effective_from);
  if (!Number.isFinite(effective) || effective > Date.now()) {
    throw new Error('El aviso de privacidad todavía no está vigente para la captura.');
  }

  if (getPrivacyNoticeMissingFields(notice).length) {
    throw new Error('El aviso vigente carece de información legal obligatoria. Solicita revisión de Administración.');
  }

  // Require coverage in BOTH texts, rather than accepting a stray keyword in
  // a draft or in a retired version. No version number is hard-coded.
  for (const text of [notice.simplified_notice, notice.integral_notice]) {
    if (typeof text !== 'string') {
      throw new Error('El aviso vigente está incompleto para preinscripciones y familiares.');
    }
    if (!/preinscripci[oó](?:n|nes)/i.test(text)
      || !/familiar(?:es)?/i.test(text)) {
      throw new Error('El aviso publicado aún no cubre preinscripciones y familiares. No guardes sus contactos hasta que Administración publique la actualización.');
    }
  }

  return notice.id;
}

/** Re-fetch on EVERY contact write: never trust a cached notice or a client checkbox. */
export async function assertIntakePublishedNotice(): Promise<string> {
  return validateIntakeNoticeCoverage(await getPublishedPrivacyNotice());
}
