import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isStaticHostApiUnavailable,
  resolveApiUrl,
  resolvePublicAssetUrl,
} from './urlHelpers';

test('resolvePublicAssetUrl handles root, relative ./, and GitHub Pages subpath bases cleanly', () => {
  const rel = '/assets/aistudio/logo.jfif';
  assert.equal(resolvePublicAssetUrl(rel, '/'), '/assets/aistudio/logo.jfif');
  assert.equal(resolvePublicAssetUrl(rel, './'), './assets/aistudio/logo.jfif');
  assert.equal(resolvePublicAssetUrl(rel, '.'), './assets/aistudio/logo.jfif');
  assert.equal(
    resolvePublicAssetUrl('assets/aistudio/logo.jfif', '/nextcandle-ai/'),
    '/nextcandle-ai/assets/aistudio/logo.jfif'
  );
  assert.equal(
    resolvePublicAssetUrl('/assets/aistudio/logo.jfif', '/nextcandle-ai'),
    '/nextcandle-ai/assets/aistudio/logo.jfif'
  );
});

test('resolveApiUrl keeps relative /api paths when VITE_API_BASE_URL is empty and joins cleanly when set', () => {
  assert.equal(resolveApiUrl('/api/auth/login', ''), '/api/auth/login');
  assert.equal(resolveApiUrl('api/auth/login', ''), '/api/auth/login');
  assert.equal(
    resolveApiUrl('/api/auth/login', 'https://api.nextcandle.example.com/'),
    'https://api.nextcandle.example.com/api/auth/login'
  );
  assert.equal(
    resolveApiUrl('api/analyze-chart', 'https://api.nextcandle.example.com'),
    'https://api.nextcandle.example.com/api/analyze-chart'
  );
});

test('isStaticHostApiUnavailable identifies static 404/405 HTML responses accurately', () => {
  assert.equal(isStaticHostApiUnavailable(405, 'text/html; charset=utf-8'), true);
  assert.equal(isStaticHostApiUnavailable(404, 'text/html'), true);
  assert.equal(isStaticHostApiUnavailable(404, 'application/json; charset=utf-8'), false);
  assert.equal(isStaticHostApiUnavailable(401, 'application/json'), false);
  assert.equal(isStaticHostApiUnavailable(500, 'text/html'), false);
});
