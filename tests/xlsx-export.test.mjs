import test from 'node:test';
import assert from 'node:assert/strict';
import { createXlsxWorkbook } from '../src/xlsx.ts';

test('creates a valid ZIP-based XLSX package with workbook and worksheet parts', () => {
  const bytes = createXlsxWorkbook([
    { name: 'Summary', rows: [['Measure', 'Value'], ['Sales', 1250]] },
    { name: 'Expenses', rows: [['Description', 'Amount'], ['Tea & sugar', 120]] },
  ]);
  assert.equal(bytes[0], 0x50);
  assert.equal(bytes[1], 0x4b);
  const content = new TextDecoder().decode(bytes);
  assert.match(content, /\[Content_Types\]\.xml/);
  assert.match(content, /xl\/workbook\.xml/);
  assert.match(content, /xl\/worksheets\/sheet1\.xml/);
  assert.match(content, /xl\/worksheets\/sheet2\.xml/);
  assert.match(content, /Tea &amp; sugar/);
  assert.match(content, /<v>1250<\/v>/);
});

test('rejects duplicate worksheet names and empty workbooks', () => {
  assert.throws(() => createXlsxWorkbook([]), /At least one worksheet/);
  assert.throws(() => createXlsxWorkbook([
    { name: 'Sales', rows: [] },
    { name: 'sales', rows: [] },
  ]), /unique/);
});
