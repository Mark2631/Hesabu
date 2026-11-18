import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
const serviceWorker = await readFile(new URL('../public/sw.js', import.meta.url), 'utf8');
const manifest = JSON.parse(await readFile(new URL('../public/manifest.json', import.meta.url), 'utf8'));
const supabase = await readFile(new URL('../src/lib/supabase.ts', import.meta.url), 'utf8');
const offlinePage = await readFile(new URL('../public/offline.html', import.meta.url), 'utf8');

test('PWA manifest is installable and uses the Hesabu reference palette', () => {
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.start_url, '/');
  assert.equal(manifest.theme_color, '#075b4c');
  assert.ok(manifest.icons.some(icon => icon.src === '/app-icon.svg' && icon.purpose.includes('maskable')));
});

test('service worker caches the application shell and falls back for offline navigation', () => {
  assert.match(serviceWorker, /hesabu-shell-v7/);
  assert.match(serviceWorker, /request\.mode === 'navigate'/);
  assert.match(serviceWorker, /caches\.match\('\/'\)/);
});

test('last authenticated business workspace is cached per business and restored offline', () => {
  assert.match(app, /hesabu:workspace-cache:v1:/);
  assert.match(app, /setOfflineMode\(true\)/);
  assert.match(app, /Offline mode/);
  assert.match(supabase, /hesabu:memberships-cache:v1:/);
  assert.match(offlinePage, /You’re offline/);
});

test('cloud financial writes are not falsely reported as successful while offline', () => {
  assert.match(app, /Offline — changes are paused/);
  assert.match(app, /Offline — sale not recorded/);
  assert.match(serviceWorker, /request\.method !== 'GET'/);
  assert.match(serviceWorker, /url\.origin !== self\.location\.origin/);
});
