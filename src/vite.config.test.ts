import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const viteConfigPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'vite.config.ts');

test('vite.config does not inject AI provider keys into the client bundle', () => {
  const source = fs.readFileSync(viteConfigPath, 'utf8');
  assert.doesNotMatch(source, /['"]process\.env\.GEMINI_API_KEY['"]/);
  assert.doesNotMatch(source, /['"]process\.env\.GOOGLE_GEMINI_API_KEY['"]/);
  assert.doesNotMatch(source, /['"]process\.env\.OPENAI_API_KEY['"]/);
  assert.doesNotMatch(source, /JSON\.stringify\(env\.(GEMINI|GOOGLE_GEMINI|OPENAI)_/);
});

test('vite envPrefix allows only public client prefixes', () => {
  const source = fs.readFileSync(viteConfigPath, 'utf8');
  assert.match(source, /envPrefix:\s*\[['"]VITE_['"],\s*['"]NEXT_PUBLIC_['"]\]/);
});
