// Formulario puro de preinscripción: contrato de entrada, sin permisos,
// llamadas a la base de datos ni creación de usuarios ficticios.
export type PreregisteredProgramInput = {
  ownerName: string;
  ownerEmail: string;
  ownerPhone: string;
  dogName: string;
  programCode: 'puppy' | 'comandos';
  programLevel: 'base' | 'principiante' | 'medio' | 'avanzado';
  physicalCardNumber: string;
  cardStartedOn: string | null;
  totalAttendances: number;
  knownAttendanceDates: string[];
  sourceNote: string;
};

export function parsePreregisteredHistory(
  rawTotal: string,
  includesDates: boolean,
  rawDates: string,
): { totalAttendances: number; knownAttendanceDates: string[] } {
  const totalAttendances = Number(rawTotal.trim());
  if (!Number.isSafeInteger(totalAttendances) || totalAttendances < 0 || totalAttendances > 500) {
    throw new Error('Indica un número de asistencias válido (0 a 500).');
  }
  const knownAttendanceDates = includesDates
    ? rawDates.split(/[\n,;]+/).map((date) => date.trim()).filter(Boolean)
    : [];
  if (knownAttendanceDates.some((date) => !/^\d{4}-\d{2}-\d{2}$/.test(date))) {
    throw new Error('Las fechas deben usar AAAA-MM-DD.');
  }
  if (new Set(knownAttendanceDates).size !== knownAttendanceDates.length ||
      knownAttendanceDates.length > totalAttendances) {
    throw new Error('No repitas fechas ni superes el total de asistencias.');
  }
  return { totalAttendances, knownAttendanceDates };
}
