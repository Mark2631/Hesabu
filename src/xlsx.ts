type WorkbookCell = string | number;
export type WorkbookSheet = { name: string; rows: WorkbookCell[][] };

const encoder = new TextEncoder();
const xmlEscape = (value: string) => value
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&apos;');

function columnName(index: number): string {
  let value = index + 1;
  let name = '';
  while (value > 0) {
    const remainder = (value - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    value = Math.floor((value - 1) / 26);
  }
  return name;
}

function worksheetXml(sheet: WorkbookSheet): string {
  const rows = sheet.rows.map((row, rowIndex) => {
    const cells = row.map((value, columnIndex) => {
      if (value === null || value === undefined || value === '') return '';
      const reference = columnName(columnIndex) + (rowIndex + 1);
      if (typeof value === 'number' && Number.isFinite(value)) {
        return '<c r="' + reference + '"' + (rowIndex === 0 ? ' s="1"' : '') + '><v>' + value + '</v></c>';
      }
      const text = xmlEscape(String(value));
      return '<c r="' + reference + '" t="inlineStr"' + (rowIndex === 0 ? ' s="1"' : '') + '><is><t xml:space="preserve">' + text + '</t></is></c>';
    }).join('');
    return '<row r="' + (rowIndex + 1) + '">' + cells + '</row>';
  }).join('');
  const lastColumn = columnName(Math.max(0, ...sheet.rows.map(row => row.length)) - 1);
  const lastRow = Math.max(1, sheet.rows.length);
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' +
    '<sheetFormatPr defaultRowHeight="18"/><sheetData>' + rows + '</sheetData>' +
    (sheet.rows.length ? '<autoFilter ref="A1:' + lastColumn + lastRow + '"/>' : '') +
    '</worksheet>';
}

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    table[n] = c >>> 0;
  }
  return table;
})();
function crc32(bytes: Uint8Array): number {
  let crc = 0xFFFFFFFF;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}
function write16(view: DataView, offset: number, value: number) { view.setUint16(offset, value, true); }
function write32(view: DataView, offset: number, value: number) { view.setUint32(offset, value >>> 0, true); }

function zipStored(files: Array<{ name: string; content: string }>): Uint8Array {
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let localOffset = 0;
  for (const file of files) {
    const name = encoder.encode(file.name);
    const data = encoder.encode(file.content);
    const checksum = crc32(data);
    const local = new Uint8Array(30 + name.length);
    const localView = new DataView(local.buffer);
    write32(localView, 0, 0x04034b50); write16(localView, 4, 20); write16(localView, 6, 0x0800);
    write16(localView, 8, 0); write16(localView, 10, 0); write16(localView, 12, 0);
    write32(localView, 14, checksum); write32(localView, 18, data.length); write32(localView, 22, data.length);
    write16(localView, 26, name.length); write16(localView, 28, 0); local.set(name, 30);
    localParts.push(local, data);

    const central = new Uint8Array(46 + name.length);
    const centralView = new DataView(central.buffer);
    write32(centralView, 0, 0x02014b50); write16(centralView, 4, 20); write16(centralView, 6, 20);
    write16(centralView, 8, 0x0800); write16(centralView, 10, 0); write16(centralView, 12, 0); write16(centralView, 14, 0);
    write32(centralView, 16, checksum); write32(centralView, 20, data.length); write32(centralView, 24, data.length);
    write16(centralView, 28, name.length); write16(centralView, 30, 0); write16(centralView, 32, 0);
    write16(centralView, 34, 0); write16(centralView, 36, 0); write32(centralView, 38, 0);
    write32(centralView, 42, localOffset); central.set(name, 46); centralParts.push(central);
    localOffset += local.length + data.length;
  }
  const centralSize = centralParts.reduce((total, part) => total + part.length, 0);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  write32(endView, 0, 0x06054b50); write16(endView, 4, 0); write16(endView, 6, 0);
  write16(endView, 8, files.length); write16(endView, 10, files.length);
  write32(endView, 12, centralSize); write32(endView, 16, localOffset); write16(endView, 20, 0);
  const total = localOffset + centralSize + end.length;
  const output = new Uint8Array(new ArrayBuffer(total));
  let offset = 0;
  for (const part of [...localParts, ...centralParts, end]) { output.set(part, offset); offset += part.length; }
  return output;
}

export function createXlsxWorkbook(sheets: WorkbookSheet[]): Uint8Array {
  if (!sheets.length) throw new Error('At least one worksheet is required.');
  if (sheets.length > 200) throw new Error('The workbook contains too many worksheets.');
  const names = new Set<string>();
  const safeSheets = sheets.map((sheet, index) => {
    const name = sheet.name.replace(/[\\/*?:\[\]]/g, ' ').trim().slice(0, 31) || 'Sheet' + (index + 1);
    if (names.has(name.toLowerCase())) throw new Error('Worksheet names must be unique.');
    names.add(name.toLowerCase());
    return { ...sheet, name };
  });
  const sheetNodes = safeSheets.map((sheet, index) => '<sheet name="' + xmlEscape(sheet.name) + '" sheetId="' + (index + 1) + '" r:id="rId' + (index + 1) + '"/>').join('');
  const workbook = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    '<bookViews><workbookView/></bookViews><sheets>' + sheetNodes + '</sheets></workbook>';
  const relationships = safeSheets.map((_, index) => '<Relationship Id="rId' + (index + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (index + 1) + '.xml"/>').join('') +
    '<Relationship Id="rId' + (safeSheets.length + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>';
  const contentTypes = '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
    safeSheets.map((_, index) => '<Override PartName="/xl/worksheets/sheet' + (index + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>').join('') +
    '</Types>';
  const styles = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Calibri"/></font></fonts>' +
    '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF172033"/><bgColor indexed="64"/></patternFill></fill></fills>' +
    '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs>' +
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';
  const files = [
    { name: '[Content_Types].xml', content: contentTypes },
    { name: '_rels/.rels', content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' },
    { name: 'xl/workbook.xml', content: workbook },
    { name: 'xl/_rels/workbook.xml.rels', content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + relationships + '</Relationships>' },
    { name: 'xl/styles.xml', content: styles },
    ...safeSheets.map((sheet, index) => ({ name: 'xl/worksheets/sheet' + (index + 1) + '.xml', content: worksheetXml(sheet) })),
  ];
  return zipStored(files);
}
