import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');
const [app, main, polish, html] = await Promise.all([
  read('../src/App.tsx'),
  read('../src/main.tsx'),
  read('../src/content-polish.css'),
  read('../index.html'),
]);

test('product copy uses consistent, owner-friendly navigation terms', () => {
  assert.match(app, /label: 'Payments'/);
  assert.doesNotMatch(app, /label: 'Money'/);
  assert.match(app, /<PageHeader title="Stock" description="See what is on hand, what is moving and what needs reordering."/);
});

test('public product copy is concise and accurately describes the demo', () => {
  assert.match(app, /Record sales, payments, stock and expenses in one place./);
  assert.match(app, /Explore a sample Kenyan shop. No account needed./);
  assert.match(app, /Changes are temporary and reset when you exit./);
  assert.match(app, /M-Pesa entries are recorded manually/);
  assert.doesNotMatch(app, /Product information is subject to change as integrations are completed/);
});

test('typography and reading-rhythm polish is loaded after the existing design layers', () => {
  assert.ok(main.indexOf("import './content-polish.css'") > main.indexOf("import './exhibition-polish.css'"));
  assert.match(polish, /font-family: 'DM Sans', system-ui, sans-serif !important/);
  assert.match(polish, /max-width: var\(--reading-measure\)/);
  assert.match(html, /family=DM\+Sans/);
});

test('search and social metadata describe the actual Hesabu product', () => {
  assert.match(html, /Hesabu \| Clear records for everyday business/);
  assert.match(html, /Hesabu helps Kenyan businesses record sales/);
});
