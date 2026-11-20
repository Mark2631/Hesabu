import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const workflow = await readFile(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8');

test('local Vite servers bind to localhost by default', () => {
  assert.equal(packageJson.scripts.dev, 'vite');
  assert.equal(packageJson.scripts.preview, 'vite preview');
  assert.ok(!packageJson.scripts.dev.includes('--host'));
  assert.ok(!packageJson.scripts.preview.includes('--host'));
});

test('CI checks production dependency advisories separately', () => {
  assert.ok(workflow.includes('npm audit --omit=dev --audit-level=high'));
});
