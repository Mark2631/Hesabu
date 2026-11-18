import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
const worker = await readFile(new URL('../public/sw.js', import.meta.url), 'utf8');
const manifest = JSON.parse(await readFile(new URL('../public/manifest.json', import.meta.url), 'utf8'));
const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');

test('PWA manifest is standalone and uses the Hesabu reference palette and icon', () => {
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.start_url, '/');
  assert.equal(manifest.theme_color, '#075b4c');
  assert.ok(manifest.icons.some(icon => icon.src === '/app-icon.svg'));
  assert.match(html, /rel="manifest"/);
});

test('service worker caches app assets and has an offline navigation fallback', () => {
  assert.match(worker, /hesabu-shell-v6/);
  assert.match(worker, /caches\.match\('\/'\)/);
  assert.match(worker, /offline\.html/);
  assert.match(worker, /request\.mode === 'navigate'/);
});

test('cached ledger is explicitly read-only and does not claim offline writes', () => {
  assert.match(app, /Saved workspace · Read only/);
  assert.match(app, /Reconnect to post sales, payments and stock changes safely/);
});

test('recent transactions are rendered immediately after the balance panel', () => {
  const hero = app.indexOf('<section className="finance-balance-hero"');
  const recent = app.indexOf('<SectionCard title="Recent transactions"');
  const daily = app.indexOf('<section className="daily-summary-section"');
  assert.ok(hero >= 0 && recent > hero && daily > recent);
});
