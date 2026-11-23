import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyGeminiApiError } from './geminiSchemas.js';
import { extractCleanBase64 } from './chartAnalysisPipeline.js';
import { withAbortTimeout } from './timeoutUtils.js';

test('classifyGeminiApiError maps Gemini upstream errors to actionable HTTP codes', () => {
  assert.equal(classifyGeminiApiError({ status: 429, message: 'RESOURCE_EXHAUSTED' }).status, 429);
  assert.equal(classifyGeminiApiError({ status: 429, message: 'RESOURCE_EXHAUSTED' }).code, 'AI_RATE_LIMITED');

  const invalidKey = classifyGeminiApiError(new Error('API_KEY_INVALID'));
  assert.equal(invalidKey.status, 502);
  assert.equal(invalidKey.code, 'AI_CREDENTIALS_INVALID');

  const missingModel = classifyGeminiApiError({ status: 404, message: 'NOT_FOUND' });
  assert.equal(missingModel.status, 502);
  assert.equal(missingModel.code, 'AI_MODEL_UNAVAILABLE');

  const timedOut = classifyGeminiApiError(new Error('Timeout de comunicação'));
  assert.equal(timedOut.status, 504);
  assert.equal(timedOut.code, 'AI_TIMEOUT');

  const upstream = classifyGeminiApiError(new Error('Malformed upstream payload'));
  assert.equal(upstream.status, 502);
  assert.equal(upstream.code, 'AI_UPSTREAM_ERROR');
});

test('extractCleanBase64 validates entire base64 payload and rejects mid-string corruption', () => {
  const validPayload = 'A'.repeat(128);
  const parsed = extractCleanBase64(`data:image/jpg;base64,${validPayload}`);
  assert.deepEqual(parsed, { mimeType: 'image/jpeg', data: validPayload });

  // Corrupted beyond first 256 chars must be rejected
  const corruptedLate = `${'A'.repeat(300)}!!!CORRUPTED!!!`;
  assert.equal(extractCleanBase64(`data:image/png;base64,${corruptedLate}`), null);

  // Disallowed SVG MIME type must be rejected
  assert.equal(extractCleanBase64(`data:image/svg+xml;base64,${validPayload}`), null);
});

test('withAbortTimeout triggers AbortSignal cleanly when operation stalls past timeout', async () => {
  let observedAbort = false;
  await assert.rejects(
    () =>
      withAbortTimeout(
        (signal) =>
          new Promise((_resolve, reject) => {
            signal.addEventListener('abort', () => {
              observedAbort = true;
              reject(new Error('aborted by signal'));
            });
          }),
        25,
        'Timeout de teste'
      ),
    /Timeout de teste/
  );
  assert.equal(observedAbort, true);
});
