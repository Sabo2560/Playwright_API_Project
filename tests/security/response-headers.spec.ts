// spec: specs/booking-api-security.plan.md
import { test, expect } from '../fixtures';

test.describe('Information Disclosure', () => {
  test.fixme('sets recommended security headers', async ({ request }) => {
    // Known gap, confirmed live via `curl -D -`: no X-Content-Type-Options, X-Frame-Options,
    // Strict-Transport-Security, or Content-Security-Policy headers on any response. The fix
    // belongs in restful-booker's app.js (e.g. adding helmet), out of scope for this repo to
    // patch upstream — this test documents the gap against a standard baseline.
    const res = await request.get('/ping');

    expect(res.headers()['x-content-type-options']).toBe('nosniff');
  });

  test.fixme('does not expose the underlying framework via X-Powered-By', async ({ request }) => {
    // Known gap, confirmed live: X-Powered-By: Express is present on every response,
    // identifying the exact framework to any client. One-line fix upstream is
    // app.disable('x-powered-by').
    const res = await request.get('/ping');

    expect(res.headers()['x-powered-by']).toBeUndefined();
  });

  test('malformed JSON body does not leak a stack trace', async ({ request }) => {
    // 1. Send a syntactically invalid JSON body
    const res = await request.post('/booking', {
      data: '{not-valid-json',
      headers: { 'Content-Type': 'application/json' },
    });

    expect(res.status()).toBe(400);
    const body = await res.text();
    expect(body).not.toContain('node_modules');
    expect(body).not.toMatch(/\bat \S+:\d+:\d+/); // stack frame marker, e.g. "at Object.<anonymous> (file:12:34)"
  });
});
