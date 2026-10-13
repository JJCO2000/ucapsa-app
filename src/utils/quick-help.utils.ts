/** Marcador por cuenta; no almacena datos personales ni registros de cursos. */
export function quickHelpSeenKey(userId: string) {
  return 'ucapsa-quick-help-v1:' + userId;
}
