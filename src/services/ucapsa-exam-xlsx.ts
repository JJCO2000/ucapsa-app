import { DOMParser } from '@xmldom/xmldom';
import { File } from 'expo-file-system';
import { strFromU8, unzipSync } from 'fflate';

export type ExamImportItemDescriptor = {
  item_number: number;
  title: string;
  max_points: number;
};

export type ExamImportRpcRow = {
  member_number: string;
  dog_name: string;
  scores: Record<string, number | string>;
};

export type ParsedExamWorkbook = {
  rows: ExamImportRpcRow[];
  sourceRows: number[];
  headerLabels: string[];
};

const REL_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

type XmlElement = {
  textContent: string | null;
  getAttribute(name: string): string | null;
  getAttributeNS(namespace: string | null, localName: string): string | null;
  getElementsByTagName(name: string): {
    length: number;
    item(index: number): XmlElement | null;
  };
};

function parseXml(xml: string, label: string) {
  const document = new DOMParser().parseFromString(xml, 'application/xml');
  const parserErrors = document.getElementsByTagName('parsererror');
  if (parserErrors.length > 0) {
    throw new Error(`El archivo Excel contiene XML inválido en ${label}.`);
  }
  return document;
}

function xmlText(element: XmlElement | null) {
  if (!element) return '';
  const nodes = element.getElementsByTagName('t');
  if (nodes.length === 0) return element.textContent ?? '';
  let value = '';
  for (let index = 0; index < nodes.length; index += 1) {
    value += nodes.item(index)?.textContent ?? '';
  }
  return value;
}

function normalizeZipPath(input: string) {
  const parts: string[] = [];
  for (const part of input.replaceAll('\\', '/').split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') {
      parts.pop();
      continue;
    }
    parts.push(part);
  }
  return parts.join('/');
}

function workbookSheetPath(files: Record<string, Uint8Array>) {
  const workbookBytes = files['xl/workbook.xml'];
  if (!workbookBytes) throw new Error('El archivo no contiene xl/workbook.xml.');

  const workbook = parseXml(strFromU8(workbookBytes), 'workbook.xml');
  const sheet = workbook.getElementsByTagName('sheet').item(0);
  if (!sheet) throw new Error('El archivo no contiene hojas.');

  const relationshipId =
    sheet.getAttribute('r:id')
    || sheet.getAttributeNS(REL_NS, 'id');

  if (!relationshipId) {
    if (files['xl/worksheets/sheet1.xml']) return 'xl/worksheets/sheet1.xml';
    throw new Error('No se pudo resolver la primera hoja del Excel.');
  }

  const relBytes = files['xl/_rels/workbook.xml.rels'];
  if (!relBytes) throw new Error('El archivo no contiene las relaciones del workbook.');

  const relationships = parseXml(strFromU8(relBytes), 'workbook.xml.rels');
  const relNodes = relationships.getElementsByTagName('Relationship');
  for (let index = 0; index < relNodes.length; index += 1) {
    const rel = relNodes.item(index);
    if (rel?.getAttribute('Id') !== relationshipId) continue;
    const target = rel.getAttribute('Target');
    if (!target) break;
    const resolved = target.startsWith('/')
      ? normalizeZipPath(target.slice(1))
      : normalizeZipPath(`xl/${target}`);
    if (files[resolved]) return resolved;
  }

  if (files['xl/worksheets/sheet1.xml']) return 'xl/worksheets/sheet1.xml';
  throw new Error('No se pudo abrir la primera hoja del Excel.');
}

function sharedStrings(files: Record<string, Uint8Array>) {
  const bytes = files['xl/sharedStrings.xml'];
  if (!bytes) return [] as string[];

  const document = parseXml(strFromU8(bytes), 'sharedStrings.xml');
  const items = document.getElementsByTagName('si');
  const values: string[] = [];

  for (let index = 0; index < items.length; index += 1) {
    values.push(xmlText(items.item(index)));
  }
  return values;
}

function columnIndexFromCellReference(reference: string | null) {
  if (!reference) return null;
  const match = /^([A-Za-z]+)\d+$/.exec(reference);
  if (!match) return null;

  let value = 0;
  for (const letter of match[1].toUpperCase()) {
    value = (value * 26) + (letter.charCodeAt(0) - 64);
  }
  return value - 1;
}

type CellValue = string | number | boolean | null;

function cellValue(cell: XmlElement, strings: string[]): CellValue {
  const type = cell.getAttribute('t');
  if (type === 'inlineStr') {
    const inline = cell.getElementsByTagName('is').item(0);
    return xmlText(inline);
  }

  const valueNode = cell.getElementsByTagName('v').item(0);
  if (!valueNode) return null;
  const raw = valueNode.textContent ?? '';

  if (type === 's') {
    const index = Number(raw);
    return Number.isInteger(index) && index >= 0 ? strings[index] ?? '' : '';
  }
  if (type === 'b') return raw === '1';
  if (type === 'str') return raw;

  const numeric = Number(raw);
  return Number.isFinite(numeric) ? numeric : raw;
}

function readFirstSheet(files: Record<string, Uint8Array>) {
  const path = workbookSheetPath(files);
  const sheetBytes = files[path];
  if (!sheetBytes) throw new Error('No se pudo leer la primera hoja.');

  const strings = sharedStrings(files);
  const document = parseXml(strFromU8(sheetBytes), path);
  const rowNodes = document.getElementsByTagName('row');
  const rows: CellValue[][] = [];

  for (let rowIndex = 0; rowIndex < rowNodes.length; rowIndex += 1) {
    const row = rowNodes.item(rowIndex);
    if (!row) continue;

    const rowNumber = Number(row.getAttribute('r') ?? rowIndex + 1);
    while (rows.length < Math.max(0, rowNumber - 1)) rows.push([]);

    const cells = row.getElementsByTagName('c');
    const values: CellValue[] = [];
    let fallbackColumn = 0;

    for (let cellIndex = 0; cellIndex < cells.length; cellIndex += 1) {
      const cell = cells.item(cellIndex);
      if (!cell) continue;
      const explicitColumn = columnIndexFromCellReference(cell.getAttribute('r'));
      const column = explicitColumn ?? fallbackColumn;
      values[column] = cellValue(cell, strings);
      fallbackColumn = column + 1;
    }
    rows[rowNumber - 1] = values;
  }

  return rows;
}

function normalizeHeader(value: CellValue) {
  return String(value ?? '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es-MX')
    .replace(/[_-]+/g, ' ')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function nonEmpty(value: CellValue) {
  return value !== null && String(value).trim() !== '';
}

function scoreValue(value: CellValue): number | string | null {
  if (value === null || String(value).trim() === '') return null;
  if (typeof value === 'number') return value;
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';

  const clean = value.trim();
  if (/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/.test(clean)) {
    const numeric = Number(clean);
    if (Number.isFinite(numeric)) return numeric;
  }
  return clean;
}

const MEMBER_HEADERS = new Set([
  'identificador',
  'member number',
  'member_number',
  'numero de socio',
  'numero socio',
  'membresia',
]);

const DOG_HEADERS = new Set([
  'perro',
  'dog',
  'dog name',
  'dog_name',
  'nombre del perro',
  'nombre perro',
]);

function itemHeaderAliases(item: ExamImportItemDescriptor) {
  const title = normalizeHeader(item.title);
  const number = String(item.item_number);
  return new Set([
    title,
    number,
    `ejercicio ${number}`,
    `item ${number}`,
    `${number} ${title}`,
  ]);
}

export function parseUcapsaExamXlsx(
  bytes: Uint8Array,
  items: ExamImportItemDescriptor[],
): ParsedExamWorkbook {
  if (bytes.length < 4 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) {
    throw new Error('El archivo seleccionado no es un .xlsx válido.');
  }
  if (items.length === 0) {
    throw new Error('El examen no tiene ejercicios configurados.');
  }

  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes);
  } catch {
    throw new Error('No se pudo abrir el archivo .xlsx.');
  }

  const grid = readFirstSheet(files);
  if (grid.length === 0 || grid[0].every((value) => !nonEmpty(value))) {
    throw new Error('La fila 1 debe contener los encabezados del Excel.');
  }

  const headers = grid[0];
  const headerLabels = headers.map((value) => String(value ?? '').trim());
  let memberColumn: number | null = null;
  let dogColumn: number | null = null;
  const scoreColumns = new Map<number, number>();
  const usedItems = new Set<number>();
  const unknownHeaders: string[] = [];

  for (let column = 0; column < headers.length; column += 1) {
    if (!nonEmpty(headers[column])) continue;
    const normalized = normalizeHeader(headers[column]);

    if (MEMBER_HEADERS.has(normalized)) {
      if (memberColumn !== null) throw new Error('El Excel tiene más de una columna Identificador.');
      memberColumn = column;
      continue;
    }

    if (DOG_HEADERS.has(normalized)) {
      if (dogColumn !== null) throw new Error('El Excel tiene más de una columna Perro.');
      dogColumn = column;
      continue;
    }

    const matched = items.filter((item) => itemHeaderAliases(item).has(normalized));
    if (matched.length !== 1) {
      unknownHeaders.push(headerLabels[column] || `columna ${column + 1}`);
      continue;
    }

    const item = matched[0];
    if (usedItems.has(item.item_number)) {
      throw new Error(`El ejercicio ${item.item_number} aparece en más de una columna.`);
    }
    usedItems.add(item.item_number);
    scoreColumns.set(column, item.item_number);
  }

  if (memberColumn === null) throw new Error('Falta la columna Identificador.');
  if (dogColumn === null) throw new Error('Falta la columna Perro.');
  if (unknownHeaders.length > 0) {
    throw new Error(`Columnas no reconocidas: ${unknownHeaders.join(', ')}.`);
  }

  const missingItems = items.filter((item) => !usedItems.has(item.item_number));
  if (missingItems.length > 0) {
    throw new Error(`Faltan columnas para: ${missingItems.map((item) => item.title).join(', ')}.`);
  }

  const rows: ExamImportRpcRow[] = [];
  const sourceRows: number[] = [];

  for (let rowIndex = 1; rowIndex < grid.length; rowIndex += 1) {
    const row = grid[rowIndex] ?? [];
    if (row.every((value) => !nonEmpty(value))) continue;

    const memberNumber = String(row[memberColumn] ?? '').trim();
    const dogName = String(row[dogColumn] ?? '').trim();
    const scores: Record<string, number | string> = {};

    for (const [column, itemNumber] of scoreColumns.entries()) {
      const parsed = scoreValue(row[column] ?? null);
      if (parsed !== null) scores[String(itemNumber)] = parsed;
    }

    rows.push({
      member_number: memberNumber,
      dog_name: dogName,
      scores,
    });
    sourceRows.push(rowIndex + 1);
  }

  if (rows.length === 0) throw new Error('El Excel no contiene filas de resultados.');

  return { rows, sourceRows, headerLabels };
}


export async function pickAndParseUcapsaExamXlsx(
  items: ExamImportItemDescriptor[],
): Promise<(ParsedExamWorkbook & { fileName: string }) | null> {
  const picked = await File.pickFileAsync({
    multipleFiles: false,
    mimeTypes: [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/octet-stream',
      'application/zip',
    ],
  });

  if (picked.canceled) return null;

  const file = picked.result;
  const fileName = file.name?.trim() || 'resultados.xlsx';
  if (!fileName.toLocaleLowerCase('es-MX').endsWith('.xlsx')) {
    throw new Error('Selecciona un archivo con extensión .xlsx.');
  }

  const bytes = await file.bytes();
  const parsed = parseUcapsaExamXlsx(bytes, items);
  return {
    ...parsed,
    fileName,
  };
}
