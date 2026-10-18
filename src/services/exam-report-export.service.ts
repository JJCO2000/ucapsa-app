import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { strToU8, zipSync } from 'fflate';

import { supabase } from '../lib/supabase';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const XML_SELF_CLOSE = '/' + '>';
type CellValue = string | number | boolean;

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

export async function getStaffExamReport(startDate: string, endDate: string, examId: string | null): Promise<StaffExamReportRow[]> {
  const { data, error } = await supabase.rpc('get_staff_exam_report', {
    p_start_date: startDate,
    p_end_date: endDate,
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


type ExamAggregate = {
  head: StaffExamReportRow;
  totalItems: number;
  gradedItems: number;
  maximum: number;
  scored: number;
};

function groupAttempts(rows: StaffExamReportRow[]) {
  const map = new Map<string, ExamAggregate>();
  for (const row of rows) {
    let attempt = map.get(row.attemptId);
    if (!attempt) {
      attempt = { head: row, totalItems: 0, gradedItems: 0, maximum: 0, scored: 0 };
      map.set(row.attemptId, attempt);
    }
    if (row.itemId) {
      attempt.totalItems += 1;
      attempt.maximum += row.maxPoints ?? 0;
      if (row.pointsAwarded !== null) {
        attempt.gradedItems += 1;
        attempt.scored += row.pointsAwarded;
      }
    }
  }
  return [...map.values()];
}

function officialLabel(row: StaffExamReportRow) {
  return row.isOfficial && row.status === 'published' && !row.voidedAt ? 'Sí' : 'No';
}

export function buildStaffExamWorkbookBytes(rows: StaffExamReportRow[], startDate: string, endDate: string) {
  const attempts = groupAttempts(rows);
  const scoredAttempts = attempts.filter((a) => a.totalItems > 0 && a.gradedItems === a.totalItems && a.maximum > 0);
  const officialAttempts = attempts.filter((a) => officialLabel(a.head) === 'Sí');
  const officialGraded = scoredAttempts.filter((a) => officialLabel(a.head) === 'Sí');
  const meanScore = officialGraded.length > 0
    ? officialGraded.reduce((sum, a) => sum + (a.scored / a.maximum), 0) / officialGraded.length
    : null;

  const stats: CellValue[][] = [
    ['Métrica', 'Valor'],
    ['Desde', startDate],
    ['Hasta', endDate],
    ['Intentos de evaluación', attempts.length],
    ['Resultados oficiales', officialAttempts.length],
    ['Resultados no oficiales o anulados', attempts.length - officialAttempts.length],
    ['Exámenes distintos', new Set(attempts.map((a) => a.head.examId)).size],
    ['Perros evaluados', new Set(attempts.map((a) => a.head.dogId)).size],
    ['Intentos con todos los ejercicios evaluados', scoredAttempts.length],
    ['Promedio de resultados oficiales completamente calificados', meanScore === null ? 'Sin datos' : `${(meanScore * 100).toFixed(1)}%`],
    ['Aprobación/reprobación', 'No calculada: no se estableció criterio oficial'],
    ['Nota', 'Sin puntuación registrada no significa 0 puntos'],
  ];

  const results: CellValue[][] = [
    ['Fecha', 'Examen', 'Intento', 'Perro', 'Cliente', 'Estado', 'Oficial', 'Evaluados', 'Total ejercicios', 'Puntos', 'Máximo', 'Calificación'],
    ...attempts.map((a) => {
      const complete = a.totalItems > 0 && a.gradedItems === a.totalItems && a.maximum > 0;
      return [
        a.head.presentedDate, a.head.examTitle, a.head.attemptNumber, a.head.dogName,
        a.head.clientName, a.head.status, officialLabel(a.head),
        a.gradedItems, a.totalItems, complete ? a.scored : 'Sin datos',
        a.maximum, complete ? `${(a.scored / a.maximum * 100).toFixed(1)}%` : 'Sin datos',
      ];
    }),
  ];

  const detail: CellValue[][] = [
    ['Fecha', 'Examen', 'Intento', 'Perro', 'Cliente', 'Ejercicio', 'Puntos máximos', 'Puntos obtenidos', 'Nota', 'Oficial', 'Estado'],
    ...rows.filter((r) => r.itemId !== null).map((r) => [
      r.presentedDate, r.examTitle, r.attemptNumber, r.dogName, r.clientName,
      r.itemTitle ?? '', r.maxPoints ?? '', r.pointsAwarded ?? 'Sin registrar',
      r.evaluatorNote ?? '', officialLabel(r), r.status,
    ]),
  ];

  const sheetNames = ['Estadísticas', 'Resultados', 'Ejercicios'];
  const sheets = [
    worksheetXml(stats, [50, 48], false),
    worksheetXml(results, [13, 30, 10, 23, 28, 17, 12, 14, 17, 15, 12, 18]),
    worksheetXml(detail, [13, 30, 10, 23, 28, 31, 18, 20, 36, 12, 17]),
  ];
  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"${XML_SELF_CLOSE}
  <Default Extension="xml" ContentType="application/xml"${XML_SELF_CLOSE}
  <Override PartName="${packagePartName('xl/workbook.xml')}" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"${XML_SELF_CLOSE}
  <Override PartName="${packagePartName('xl/styles.xml')}" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"${XML_SELF_CLOSE}
  ${sheetNames.map((_, n) => `<Override PartName="${packagePartName(`xl/worksheets/sheet${n + 1}.xml`)}" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"${XML_SELF_CLOSE}`).join('')}
</Types>`),
    '_rels/.rels': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"${XML_SELF_CLOSE}
</Relationships>`),
    'xl/workbook.xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
 <sheets>${sheetNames.map((n, i) => `<sheet name="${n}" sheetId="${i + 1}" r:id="rId${i + 1}"${XML_SELF_CLOSE}`).join('')}</sheets>
</workbook>`),
    'xl/_rels/workbook.xml.rels': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${sheetNames.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"${XML_SELF_CLOSE}`).join('')}
  <Relationship Id="rId${sheetNames.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"${XML_SELF_CLOSE}
</Relationships>`),
    'xl/styles.xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="2"><font><sz val="11"${XML_SELF_CLOSE}<name val="Calibri"${XML_SELF_CLOSE}</font><font><b${XML_SELF_CLOSE}<sz val="11"${XML_SELF_CLOSE}<name val="Calibri"${XML_SELF_CLOSE}</font></fonts>
  <fills count="2"><fill><patternFill patternType="none"${XML_SELF_CLOSE}</fill><fill><patternFill patternType="gray125"${XML_SELF_CLOSE}</fill></fills>
  <borders count="1"><border><left${XML_SELF_CLOSE}<right${XML_SELF_CLOSE}<top${XML_SELF_CLOSE}<bottom${XML_SELF_CLOSE}<diagonal${XML_SELF_CLOSE}</border></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"${XML_SELF_CLOSE}</cellStyleXfs>
  <cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"${XML_SELF_CLOSE}
  <xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"${XML_SELF_CLOSE}</cellXfs>
</styleSheet>`),
  };
  for (let i = 0; i < sheets.length; i += 1) {
    files[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(sheets[i]);
  }
  return zipSync(files, { level: 6 });
}

export async function exportStaffExamReportXlsx(
  rows: StaffExamReportRow[],
  startDate: string,
  endDate: string,
) {
  const name = `UCAPSA_examenes_${startDate.replaceAll('-', '')}_${endDate.replaceAll('-', '')}.xlsx`;
  const file = new File(Paths.cache, name);
  if (file.exists) file.delete();
  file.create();
  await file.write(buildStaffExamWorkbookBytes(rows, startDate, endDate));
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, {
      dialogTitle: 'Exportar exámenes UCAPSA',
      mimeType: XLSX_MIME,
      UTI: 'org.openxmlformats.spreadsheetml.sheet',
    });
  }
  return file.uri;
}
