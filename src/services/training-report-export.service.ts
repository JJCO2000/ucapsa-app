import { downloadTrainingReport } from './training-report-download';
import { strToU8, zipSync } from 'fflate';

import type { StaffTrainingReportRow, StaffRecordedAttendanceRow } from './trainer-staff.service';

const XML_SELF_CLOSE = '/' + '>';
type CellValue = string | number | boolean;

export type TrainingReportStats = {
  uniqueClients: number;
  uniqueDogs: number;
  classOccurrences: number;
  eligibleRows: number;
  confirmed: number;
  declined: number;
  noResponse: number;
  attended: number;
  absent: number;
  unmarked: number;
  missingAttendance: number;
  markedOutcomes: number;
  confirmedAttended: number;
  confirmedMarked: number;
  attendanceRate: number | null;
  markCoverageRate: number | null;
  confirmedAttendanceRate: number | null;
};

function xmlEscape(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function columnName(index: number) {
  let value = index + 1;
  let name = '';
  while (value > 0) {
    const mod = (value - 1) % 26;
    name = String.fromCharCode(65 + mod) + name;
    value = Math.floor((value - 1) / 26);
  }
  return name;
}

function packagePartName(value: string) {
  return `/${value.replace(/^\/+/, '')}`;
}

function inlineCell(reference: string, value: CellValue, style = 0) {
  if (typeof value === 'number') {
    return `<c r="${reference}" s="${style}"><v>${Number.isFinite(value) ? value : 0}</v></c>`;
  }
  if (typeof value === 'boolean') {
    return `<c r="${reference}" s="${style}" t="b"><v>${value ? 1 : 0}</v></c>`;
  }
  return `<c r="${reference}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(value)}</t></is></c>`;
}

function levelLabel(programCode: string, level: string) {
  if (programCode !== 'comandos') return 'Puppy';
  if (level === 'principiante' || level === 'base') return 'Básico';
  if (level === 'medio') return 'Intermedio';
  if (level === 'avanzado') return 'Avanzado';
  return level || 'Básico';
}

function rsvpLabel(value: StaffTrainingReportRow['rsvpResponse']) {
  if (value === 'yes') return 'Confirmó';
  if (value === 'no') return 'No asistirá';
  return 'Sin respuesta';
}

export function formatTrainingPercentage(value: number | null) {
  return value === null ? 'Sin datos' : `${(value * 100).toFixed(1)}%`;
}

export function buildTrainingReportStats(rows: StaffTrainingReportRow[]): TrainingReportStats {
  const uniqueClients = new Set(rows.map((row) => row.userId)).size;
  const uniqueDogs = new Set(rows.map((row) => row.dogId ?? row.enrollmentId)).size;
  const classOccurrences = new Set(
    rows.map((row) => `${row.classDate}:${row.scheduleId}:${row.startTime}`),
  ).size;
  const confirmed = rows.filter((row) => row.rsvpResponse === 'yes').length;
  const declined = rows.filter((row) => row.rsvpResponse === 'no').length;
  const noResponse = rows.length - confirmed - declined;
  const attended = rows.filter((row) => row.attended).length;
  const absent = rows.filter((row) => row.absent).length;
  const markedOutcomes = attended + absent;
  const unmarked = Math.max(0, rows.length - markedOutcomes);
  const confirmedAttended = rows.filter((row) => row.rsvpResponse === 'yes' && row.attended).length;
  const confirmedMarked = rows.filter((row) => row.rsvpResponse === 'yes' && (row.attended || row.absent)).length;

  return {
    uniqueClients,
    uniqueDogs,
    classOccurrences,
    eligibleRows: rows.length,
    confirmed,
    declined,
    noResponse,
    attended,
    absent,
    unmarked,
    missingAttendance: unmarked,
    markedOutcomes,
    confirmedAttended,
    confirmedMarked,
    attendanceRate: markedOutcomes > 0 ? attended / markedOutcomes : null,
    markCoverageRate: rows.length > 0 ? markedOutcomes / rows.length : null,
    confirmedAttendanceRate: confirmedMarked > 0 ? confirmedAttended / confirmedMarked : null,
  };
}

type ProgramStats = {
  program: string;
  level: string;
  eligible: number;
  attended: number;
  absent: number;
  unmarked: number;
  missingAttendance: number;
  confirmed: number;
  declined: number;
  noResponse: number;
  attendanceRate: number | null;
  markCoverageRate: number | null;
};

function buildProgramStats(rows: StaffTrainingReportRow[]): ProgramStats[] {
  const groups = new Map<string, {
    program: string;
    level: string;
    eligible: number;
    attended: number;
    absent: number;
    confirmed: number;
    declined: number;
    noResponse: number;
  }>();

  for (const row of rows) {
    const level = levelLabel(row.programCode, row.programLevel);
    const key = `${row.programCode}:${level}`;
    const current = groups.get(key) ?? {
      program: row.programName,
      level,
      eligible: 0,
      attended: 0,
      absent: 0,
      confirmed: 0,
      declined: 0,
      noResponse: 0,
    };
    current.eligible += 1;
    if (row.attended) current.attended += 1;
    if (row.absent) current.absent += 1;
    if (row.rsvpResponse === 'yes') current.confirmed += 1;
    else if (row.rsvpResponse === 'no') current.declined += 1;
    else current.noResponse += 1;
    groups.set(key, current);
  }

  return [...groups.values()]
    .map((item) => ({
      ...item,
      unmarked: Math.max(0, item.eligible - item.attended - item.absent),
      missingAttendance: Math.max(0, item.eligible - item.attended - item.absent),
      attendanceRate: (item.attended + item.absent) > 0 ? item.attended / (item.attended + item.absent) : null,
      markCoverageRate: item.eligible > 0 ? (item.attended + item.absent) / item.eligible : null,
    }))
    .sort((left, right) =>
      left.program.localeCompare(right.program, 'es-MX') || left.level.localeCompare(right.level, 'es-MX'),
    );
}

function worksheetXml(rows: CellValue[][], widths: number[], withFilter = true) {
  const sheetRows = rows.map((row, rowIndex) => {
    const cells = row.map((value, columnIndex) =>
      inlineCell(`${columnName(columnIndex)}${rowIndex + 1}`, value, rowIndex === 0 ? 1 : 0),
    ).join('');
    return `<row r="${rowIndex + 1}">${cells}</row>`;
  }).join('');

  const columns = widths.map((width, index) =>
    `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"${XML_SELF_CLOSE}`,
  ).join('');

  const maxColumn = columnName(Math.max(0, (rows[0]?.length ?? 1) - 1));
  const filter = withFilter && rows.length > 0
    ? `<autoFilter ref="A1:${maxColumn}${Math.max(1, rows.length)}"${XML_SELF_CLOSE}`
    : '';

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <cols>${columns}</cols>
  <sheetData>${sheetRows}</sheetData>
  ${filter}
</worksheet>`;
}

function workbookBytes(
  rows: StaffTrainingReportRow[],
  startDate: string,
  endDate: string,
  recordedRows: StaffRecordedAttendanceRow[],
) {
  const stats = buildTrainingReportStats(rows);
  const summaryRows: CellValue[][] = [
    ['Métrica', 'Valor'],
    ['Desde', startDate],
    ['Hasta', endDate],
    ['Asistencias realmente registradas', recordedRows.length],
    ['Registros con horario coincidente', recordedRows.filter((row) => row.scheduleMatchStatus === 'matches_schedule').length],
    ['Registros sin coincidencia en programación', recordedRows.filter((row) => row.scheduleMatchStatus !== 'matches_schedule').length],
    ['Clientes únicos', stats.uniqueClients],
    ['Perros únicos', stats.uniqueDogs],
    ['Clases con inscritos', stats.classOccurrences],
    ['Participaciones elegibles', stats.eligibleRows],
    ['Confirmaron asistencia', stats.confirmed],
    ['Indicaron que no asistirían', stats.declined],
    ['Sin respuesta RSVP', stats.noResponse],
    ['Asistieron', stats.attended],
    ['No asistieron', stats.absent],
    ['Sin resultado registrado', stats.unmarked],
    ['Tasa de asistencia sobre resultados marcados', formatTrainingPercentage(stats.attendanceRate)],
    ['Cobertura del registro de asistencia', formatTrainingPercentage(stats.markCoverageRate)],
    ['Confirmados que asistieron', stats.confirmedAttended],
    ['Confirmados con asistencia registrada', stats.confirmedMarked],
    ['Tasa confirmados → asistencia (marcados)', formatTrainingPercentage(stats.confirmedAttendanceRate)],
  ];

  const programRows: CellValue[][] = [
    ['Programa', 'Nivel', 'Elegibles', 'Asistieron', 'No asistieron', 'Sin registrar', 'Confirmaron', 'No asistirán (RSVP)', 'Sin respuesta', 'Tasa asistencia', 'Cobertura registro'],
    ...buildProgramStats(rows).map((item) => [
      item.program,
      item.level,
      item.eligible,
      item.attended,
      item.absent,
      item.unmarked,
      item.confirmed,
      item.declined,
      item.noResponse,
      formatTrainingPercentage(item.attendanceRate),
      formatTrainingPercentage(item.markCoverageRate),
    ]),
  ];

  const detailRows: CellValue[][] = [
    ['Fecha', 'Hora', 'Programa', 'Nivel', 'Cliente', 'Perro', 'Confirmación', 'Asistencia'],
    ...rows.map((row) => [
      row.classDate,
      row.startTime,
      row.programName,
      levelLabel(row.programCode, row.programLevel),
      row.clientName,
      row.dogName,
      rsvpLabel(row.rsvpResponse),
      row.attended ? 'Asistió' : row.absent ? 'No asistió' : 'Sin registrar',
    ]),
  ];

  const recordedDetailRows: CellValue[][] = [
    ['Fecha', 'Hora base', 'Programa', 'Nivel', 'Cliente', 'Perro', 'Estado inscripción', 'Origen', 'Relación con horario', 'Fuera de ventana'],
    ...recordedRows.map((row) => [
      row.classDate,
      row.scheduleTime ?? 'No disponible',
      row.programName,
      levelLabel(row.programCode, row.programLevel),
      row.clientName,
      row.dogName,
      row.enrollmentStatus,
      row.attendanceSource ?? 'No especificado',
      row.scheduleMatchStatus === 'matches_schedule' ? 'Coincide'
        : row.scheduleMatchStatus === 'before_enrollment' ? 'Antes del inicio'
        : row.scheduleMatchStatus === 'cancelled_class' ? 'Clase cancelada'
        : row.scheduleMatchStatus === 'outside_day' ? 'Otro día'
        : row.scheduleMatchStatus === 'outside_cycle' ? 'Otro ciclo'
        : row.scheduleMatchStatus === 'inactive_schedule' ? 'Horario inactivo'
        : 'Sin horario',
      row.outsideWindow ? 'Sí' : 'No',
    ]),
  ];

  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="${packagePartName('xl/workbook.xml')}" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="${packagePartName('xl/worksheets/sheet1.xml')}" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="${packagePartName('xl/worksheets/sheet2.xml')}" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="${packagePartName('xl/worksheets/sheet3.xml')}" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="${packagePartName('xl/worksheets/sheet4.xml')}" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="${packagePartName('xl/styles.xml')}" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`),
    '_rels/.rels': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`),
    'xl/workbook.xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="Resumen" sheetId="1" r:id="rId1"/>
    <sheet name="Por programa" sheetId="2" r:id="rId2"/>
    <sheet name="Detalle" sheetId="3" r:id="rId3"/>
    <sheet name="Asistencias registradas" sheetId="4" r:id="rId4"/>
  </sheets>
</workbook>`),
    'xl/_rels/workbook.xml.rels': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet3.xml"/>
  <Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet4.xml"/>
  <Relationship Id="rId5" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`),
    'xl/styles.xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="2">
    <font><sz val="11"/><name val="Calibri"/></font>
    <font><b/><sz val="11"/><name val="Calibri"/></font>
  </fonts>
  <fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>
  <borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="2">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
  </cellXfs>
</styleSheet>`),
    'xl/worksheets/sheet1.xml': strToU8(worksheetXml(summaryRows, [34, 22], false)),
    'xl/worksheets/sheet2.xml': strToU8(worksheetXml(programRows, [22, 18, 12, 12, 14, 14, 12, 18, 12, 16, 16])),
    'xl/worksheets/sheet3.xml': strToU8(worksheetXml(detailRows, [13, 10, 20, 18, 24, 24, 18, 24])),
    'xl/worksheets/sheet4.xml': strToU8(worksheetXml(recordedDetailRows, [13, 12, 20, 18, 24, 24, 20, 18, 23, 18])),
  };

  return zipSync(files, { level: 6 });
}

export async function exportTrainingReportXlsx(
  rows: StaffTrainingReportRow[],
  startDate: string,
  endDate: string,
  recordedRows: StaffRecordedAttendanceRow[],
) {
  const safeStart = startDate.replaceAll('-', '');
  const safeEnd = endDate.replaceAll('-', '');
  const fileName = `UCAPSA_estadisticas_clases_${safeStart}_${safeEnd}.xlsx`;
  return downloadTrainingReport(workbookBytes(rows, startDate, endDate, recordedRows), fileName);
}
