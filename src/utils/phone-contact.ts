/** UI normalization, not phone ownership proof or an Auth link.
 * Mexican 10-digit numbers can be entered without +52.
 * International numbers must already include their country prefix.
 */
export function normalizeContactPhone(raw: string): string {
  const input = raw.trim().replace(/[\s(),.-]/g, '');
  if (/^[0-9]{10}$/.test(input)) return '+52' + input;
  if (/^52[0-9]{10}$/.test(input)) return '+' + input;
  if (/^\+[1-9][0-9]{7,14}$/.test(input)) return input;
  throw new Error('Escribe 10 dígitos de México o un número internacional con + y código de país.');
}

/** Compara contactos en formatos legados o E.164; no acredita su titularidad. */
export function sameContactPhone(left: string | null | undefined, right: string | null | undefined): boolean {
  if (!left?.trim() || !right?.trim()) return false;
  try {
    return normalizeContactPhone(left) === normalizeContactPhone(right);
  } catch {
    return false;
  }
}
