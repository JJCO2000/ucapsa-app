import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { strToU8, zipSync } from 'fflate';

import { getProgramLevelLabel } from './programs.service';
import type { StaffClassReportRow } from './staff-operations.service';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function xmlEscape(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function columnName(index: number) {
  let n = index + 1;
  let result = '';
  while (n > 0) {
    const remainder = (n - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    n = Math.floor((n - 1) / 26);
  }
  return result;
}

function inlineCell(reference: string, value: string) {
  return `<c r="${reference}" t="inlineStr"><is><t>${xmlEscape(value)}</t></is></c>`;
}

function numberCell(reference: string, value: number) {
  return `<c r="${reference}"><v>${Number.isFinite(value) ? value : 0}</v></c>`;
}

function worksheetXml(rows: StaffClassReportRow[]) {
  const headers = [
    'Fecha',
    'Programa',
    'Nivel',
    'Hora',
    'Inscritos vigentes',
    'Confirmados',
    'No asistirán',
    'Sin respuesta',
    'Asistencia real',
  ];

  const records: Array<Array<string | number>> = [
    headers,
    ...rows.map((row) => [
      row.classDate,
      row.programCode === 'puppy' ? 'Puppy' : 'Comandos',
      row.programCode === 'comandos' ? getProgramLevelLabel(row.programLevel as never) : 'Puppy',
      row.startTime,
      row.eligibleCount,
      row.confirmedCount,
      row.declinedCount,
      row.noResponseCount,
      row.attendanceCount,
    ]),
  ];

  const sheetRows = records.map((record, rowIndex) => {
    const rowNumber = rowIndex + 1;
    const cells = record.map((value, columnIndex) => {
      const ref = `${columnName(columnIndex)}${rowNumber}`;
      return typeof value === 'number' ? numberCell(ref, value) : inlineCell(ref, String(value));
    }).join('');
    return `<row r="${rowNumber}">${cells}</row>`;
  }).join('');

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>${sheetRows}</sheetData>
</worksheet>`;
}

function buildWorkbook(rows: StaffClassReportRow[]) {
  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>`),
    '_rels/.rels': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`),
    'xl/workbook.xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets><sheet name="Clases UCAPSA" sheetId="1" r:id="rId1"/></sheets>
</workbook>`),
    'xl/_rels/workbook.xml.rels': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>`),
    'xl/worksheets/sheet1.xml': strToU8(worksheetXml(rows)),
  };

  return zipSync(files, { level: 6 });
}

export async function shareStaffClassReportXlsx(
  rows: StaffClassReportRow[],
  fromDate: string,
  toDate: string,
) {
  if (rows.length === 0) throw new Error('No hay clases en el rango seleccionado.');

  const filename = `UCAPSA_Clases_${fromDate}_a_${toDate}.xlsx`;
  const file = new File(Paths.cache, filename);
  file.write(buildWorkbook(rows));

  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('Este dispositivo no permite compartir archivos desde UCAPSA.');
  }

  await Sharing.shareAsync(file.uri, {
    dialogTitle: 'Compartir reporte UCAPSA',
    mimeType: XLSX_MIME,
    UTI: 'org.openxmlformats.spreadsheetml.sheet',
  });

  return file.uri;
}
