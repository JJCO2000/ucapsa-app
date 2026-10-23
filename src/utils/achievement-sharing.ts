// Mensaje público y voluntario: nunca incluye correo, ID, fotos ni datos de otros perros.
export function buildAchievementShareMessage(title: string): string {
  const safeTitle = title.replace(/[\r\n\t]+/g, ' ').trim().replace(/\s+/g, ' ').slice(0, 80) || 'un logro';
  return `🏅 ¡Conseguí ${safeTitle} en UCAPSA! Seguimos aprendiendo y entrenando.`;
}
