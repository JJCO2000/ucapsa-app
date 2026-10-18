import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { strToU8, zipSync } from 'fflate';

import { supabase } from '../lib/supabase';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const XML_SELF_CLOSE = '/' + '>';
type CellValue = string | number | boolean | { formula: string; cached: number | null };

export type StaffExamReportRow = {
  attemptId: string;
  examId: string;
  examCode: string;
  examTitle: string;
  presentedDate: string;
  attemptNumber: number;
  status: string;
  isOfficial: boolean;
  voidedAt: string | null;
  dogId: string;
  dogName: string;
  clientName: string;
  itemId: string | null;
  itemNumber: number | null;
  itemTitle: string | null;
  maxPoints: number | null;
  pointsAwarded: number | null;
  evaluatorNote: string | null;
};

export async function getStaffExamReport(examId: string): Promise<StaffExamReportRow[]> {
  const { data, error } = await supabase.rpc('get_staff_exam_report', {
    p_exam_id: examId,
  });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    attemptId: row.attempt_id,
    examId: row.exam_id,
    examCode: row.exam_code,
    examTitle: row.exam_title,
    presentedDate: row.presented_date,
    attemptNumber: Number(row.attempt_number),
    status: row.attempt_status,
    isOfficial: Boolean(row.is_official),
    voidedAt: row.voided_at,
    dogId: row.dog_id,
    dogName: row.dog_name,
    clientName: row.client_name,
    itemId: row.item_id,
    itemNumber: row.item_number,
    itemTitle: row.item_title,
    maxPoints: row.max_points === null ? null : Number(row.max_points),
    pointsAwarded: row.points_awarded === null ? null : Number(row.points_awarded),
    evaluatorNote: row.evaluator_note,
  }));
}

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
  if (typeof value === 'object') {
    const { formula, cached } = value;
    return cached === null
      ? '<c r="' + reference + '" s="2" t="str"><f>' + xmlEscape(formula) + '</f><v>Incompleto</v></c>'
      : '<c r="' + reference + '" s="2"><f>' + xmlEscape(formula) + '</f><v>' + cached + '</v></c>';
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Número inválido en el reporte UCAPSA.');
    return `<c r="${reference}" s="${style}"><v>${value}</v></c>`;
  }
  if (typeof value === 'boolean') {
    return `<c r="${reference}" s="${style}" t="b"><v>${value ? 1 : 0}</v></c>`;
  }
  return `<c r="${reference}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(value)}</t></is></c>`;
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


export function buildStaffExamWorkbookBytes(rows: StaffExamReportRow[], selectedDogIds: string[]) {
  const selected = new Set(selectedDogIds);
  const eligible = rows.filter((r) => selected.has(r.dogId) &&
    r.isOfficial && r.status === 'published' && r.voidedAt === null);
  if (!eligible.length) throw new Error('No hay resultados oficiales para los perros seleccionados.');
  if (eligible.some((r) => r.examId !== eligible[0].examId)) {
    throw new Error('Selecciona un solo examen para la comparación.');
  }

  // Los nombres no son identificadores. UUID evita combinar perros homónimos.
  const best = new Map<string, StaffExamReportRow>();
  for (const r of eligible) {
    const older = best.get(r.dogId);
    if (!older || r.presentedDate > older.presentedDate ||
      (r.presentedDate === older.presentedDate && r.attemptNumber > older.attemptNumber) ||
      (r.presentedDate === older.presentedDate && r.attemptNumber === older.attemptNumber &&
        r.attemptId > older.attemptId)) {
      best.set(r.dogId, r);
    }
  }
  const dogs = [...best.values()].sort((a, b) =>
    a.dogName.localeCompare(b.dogName, 'es-MX') ||
    a.clientName.localeCompare(b.clientName, 'es-MX') ||
    a.dogId.localeCompare(b.dogId));
  const current = eligible.filter((r) => best.get(r.dogId)?.attemptId === r.attemptId);
  const collisions = new Map<string, number>();
  for (const dog of dogs) {
    const key = dog.dogName.trim().toLocaleLowerCase('es-MX');
    collisions.set(key, (collisions.get(key) ?? 0) + 1);
  }
  const labels = dogs.map((dog) => {
    const name = dog.dogName.trim() || 'Perro';
    return (collisions.get(name.toLocaleLowerCase('es-MX')) ?? 0) > 1
      ? name + ' · ' + dog.clientName + ' · ' + dog.dogId.slice(-4)
      : name;
  });
  const exercises = new Map<string, StaffExamReportRow>();
  const resultByAttemptItem = new Map<string, StaffExamReportRow>();
  for (const r of current) {
    if (!r.itemId) continue;
    if (!exercises.has(r.itemId)) exercises.set(r.itemId, r);
    const key = r.attemptId + ':' + r.itemId;
    if (resultByAttemptItem.has(key)) throw new Error('El reporte contiene calificaciones duplicadas.');
    resultByAttemptItem.set(key, r);
  }
  const items = [...exercises.values()].sort((a, b) =>
    (a.itemNumber ?? 0) - (b.itemNumber ?? 0) ||
    String(a.itemId).localeCompare(String(b.itemId)));
  if (!items.length) throw new Error('El examen no tiene ejercicios disponibles.');

  const grid: CellValue[][] = [
    ['Ejercicio', 'Máximo', ...labels],
    ...items.map((item): CellValue[] => [
      item.itemTitle ?? 'Ejercicio',
      item.maxPoints ?? 0,
      ...dogs.map((dog): CellValue =>
        resultByAttemptItem.get(dog.attemptId + ':' + item.itemId)?.pointsAwarded ?? 'Sin registrar'),
    ]),
  ];
  const lastExerciseRow = items.length + 1;
  const averages: CellValue[] = dogs.map((dog, i) => {
    const col = columnName(i + 2);
    const scores = items.map((item) =>
      resultByAttemptItem.get(dog.attemptId + ':' + item.itemId)?.pointsAwarded);
    const complete = scores.every((value) => value !== null && value !== undefined);
    const max = items.reduce((total, item) => total + (item.maxPoints ?? 0), 0);
    const awarded = scores.reduce((total, value) => total + (value ?? 0), 0);
    const formula = 'IF(COUNT(' + col + '2:' + col + lastExerciseRow +
      ')=ROWS($B$2:$B$' + lastExerciseRow + '),SUM(' + col + '2:' + col +
      lastExerciseRow + ')/SUM($B$2:$B$' + lastExerciseRow + '),"Incompleto")';
    return { formula, cached: complete && max > 0 ? awarded / max : null };
  });
  grid.push(['Promedio', '', ...averages]);

  const sheetNames = ['Comparación'];
  const sheets = [worksheetXml(grid, [34, 12, ...dogs.map(() => 23)], false)];
  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"' + XML_SELF_CLOSE +
      '<Default Extension="xml" ContentType="application/xml"' + XML_SELF_CLOSE +
      '<Override PartName="' + packagePartName('xl/workbook.xml') + '" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"' + XML_SELF_CLOSE +
      '<Override PartName="' + packagePartName('xl/styles.xml') + '" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"' + XML_SELF_CLOSE +
      '<Override PartName="' + packagePartName('xl/worksheets/sheet1.xml') + '" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"' + XML_SELF_CLOSE +
      '</Types>'),
    '_rels/.rels': strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"' + XML_SELF_CLOSE +
      '</Relationships>'),
    'xl/workbook.xml': strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      '<sheets><sheet name="Comparación" sheetId="1" r:id="rId1"' + XML_SELF_CLOSE + '</sheets>' +
      '<calcPr fullCalcOnLoad="1"' + XML_SELF_CLOSE + '</workbook>'),
    'xl/_rels/workbook.xml.rels': strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"' + XML_SELF_CLOSE +
      '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"' + XML_SELF_CLOSE +
      '</Relationships>'),
    'xl/styles.xml': strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<fonts count="2"><font><sz val="11"' + XML_SELF_CLOSE + '<name val="Calibri"' + XML_SELF_CLOSE +
      '</font><font><b' + XML_SELF_CLOSE + '<sz val="11"' + XML_SELF_CLOSE + '<name val="Calibri"' + XML_SELF_CLOSE + '</font></fonts>' +
      '<fills count="2"><fill><patternFill patternType="none"' + XML_SELF_CLOSE + '</fill><fill><patternFill patternType="gray125"' + XML_SELF_CLOSE + '</fill></fills>' +
      '<borders count="1"><border><left' + XML_SELF_CLOSE + '<right' + XML_SELF_CLOSE + '<top' + XML_SELF_CLOSE + '<bottom' + XML_SELF_CLOSE + '<diagonal' + XML_SELF_CLOSE + '</border></borders>' +
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"' + XML_SELF_CLOSE + '</cellStyleXfs>' +
      '<cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"' + XML_SELF_CLOSE +
      '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"' + XML_SELF_CLOSE +
      '<xf numFmtId="10" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"' + XML_SELF_CLOSE +
      '</cellXfs></styleSheet>'),
    'xl/worksheets/sheet1.xml': strToU8(sheets[0]),
  };
  return zipSync(files, { level: 6 });
}

export async function exportStaffExamReportXlsx(
  rows: StaffExamReportRow[],
  examCode: string,
  selectedDogIds: string[],
) {
  const safe = examCode.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 55) || 'examen';
  const name = `UCAPSA_comparativo_${safe}.xlsx`;
  const file = new File(Paths.cache, name);
  if (file.exists) file.delete();
  file.create();
  await file.write(buildStaffExamWorkbookBytes(rows, selectedDogIds));
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, {
      dialogTitle: 'Exportar exámenes UCAPSA',
      mimeType: XLSX_MIME,
      UTI: 'org.openxmlformats.spreadsheetml.sheet',
    });
  }
  return file.uri;
}
