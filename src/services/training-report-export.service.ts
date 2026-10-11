import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { strToU8, zipSync } from 'fflate';

import type { StaffTrainingReportRow } from './trainer-staff.service';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

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

function inlineCell(reference: string, value: string | number | boolean, style = 0) {
  if (typeof value === 'number') {
    return `<c r="${reference}" s="${style}"><v>${value}</v></c>`;
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

function worksheetXml(rows: StaffTrainingReportRow[]) {
  const headers = ['Fecha', 'Hora', 'Programa', 'Nivel', 'Cliente', 'Perro', 'Confirmación', 'Asistió'];
  const data = rows.map((row) => [
    row.classDate,
    row.startTime,
    row.programName,
    levelLabel(row.programCode, row.programLevel),
    row.clientName,
    row.dogName,
    rsvpLabel(row.rsvpResponse),
    row.attended ? 'Sí' : 'No',
  ]);

  const sheetRows = [headers, ...data].map((row, rowIndex) => {
    const cells = row.map((value, columnIndex) =>
      inlineCell(`${columnName(columnIndex)}${rowIndex + 1}`, String(value), rowIndex === 0 ? 1 : 0),
    ).join('');
    return `<row r="${rowIndex + 1}">${cells}</row>`;
  }).join('');

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <cols>
    <col min="1" max="1" width="13" customWidth="1"/>
    <col min="2" max="2" width="10" customWidth="1"/>
    <col min="3" max="4" width="18" customWidth="1"/>
    <col min="5" max="6" width="24" customWidth="1"/>
    <col min="7" max="8" width="18" customWidth="1"/>
  </cols>
  <sheetData>${sheetRows}</sheetData>
  <autoFilter ref="A1:H${Math.max(1, data.length + 1)}"/>
</worksheet>`;
}

function workbookBytes(rows: StaffTrainingReportRow[]) {
  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`),
    '_rels/.rels': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`),
    'xl/workbook.xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets><sheet name="Clases" sheetId="1" r:id="rId1"/></sheets>
</workbook>`),
    'xl/_rels/workbook.xml.rels': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
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
    'xl/worksheets/sheet1.xml': strToU8(worksheetXml(rows)),
  };

  return zipSync(files, { level: 6 });
}

export async function exportTrainingReportXlsx(
  rows: StaffTrainingReportRow[],
  startDate: string,
  endDate: string,
) {
  const safeStart = startDate.replaceAll('-', '');
  const safeEnd = endDate.replaceAll('-', '');
  const file = new File(Paths.cache, `UCAPSA_clases_${safeStart}_${safeEnd}.xlsx`);
  if (file.exists) file.delete();
  file.create();
  await file.write(workbookBytes(rows));

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, {
      dialogTitle: 'Exportar reporte UCAPSA',
      mimeType: XLSX_MIME,
      UTI: 'org.openxmlformats.spreadsheetml.sheet',
    });
  }

  return file.uri;
}
