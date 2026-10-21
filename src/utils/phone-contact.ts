/** Normalización de contacto, no prueba de propiedad ni de identidad Auth.
 * Los números nacionales de México pueden escribirse con diez dígitos.
 * Otros países requieren el prefijo internacional.
 */
function canonicalPhoneOrNull(raw: string): string | null {
  const input = raw.trim().replace(/[\s(),.-]/g, '');
  if (/^[0-9]{10}$/.test(input)) return '+52' + input;
  if (/^52[0-9]{10}$/.test(input)) return '+' + input;
  if (/^\+[1-9][0-9]{7,14}$/.test(input)) return input;
  return null;
}

export function normalizeContactPhone(raw: string): string {
  const phone = canonicalPhoneOrNull(raw);
  if (!phone) throw new Error('Escribe 10 dígitos de México o un número internacional con + y código de país.');
  return phone;
}

/** Comparación segura del mismo número en formato local, legado o E.164.
 * No acredita la titularidad ni habilita acceso por teléfono.
 */
export function sameContactPhone(left: string | null | undefined, right: string | null | undefined): boolean {
  if (!left?.trim() || !right?.trim()) return false;
  const normalizedLeft = canonicalPhoneOrNull(left);
  return normalizedLeft !== null && normalizedLeft === canonicalPhoneOrNull(right);
}
