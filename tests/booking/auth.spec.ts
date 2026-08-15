// spec: specs/booking-api.plan.md
import { test, expect } from '@playwright/test';

test.describe('Auth', () => {
  test('issues token for valid credentials', async ({ request }) => {
    // 1. Send POST /auth with valid admin credentials
    const res = await request.post('/auth', {
      data: { username: 'admin', password: 'password123' },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(typeof body.token).toBe('string');
    expect(body.token.length).toBeGreaterThan(0);
  });

  test('rejects wrong password without an error status', async ({ request }) => {
    // 1. Send POST /auth with a bad password — API responds 200 with a reason, not 401
    const res = await request.post('/auth', {
      data: { username: 'admin', password: 'wrong-password' },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ reason: 'Bad credentials' });
    expect(body.token).toBeUndefined();
  });

  test('rejects missing credentials', async ({ request }) => {
    // 1. Send POST /auth with an empty payload
    const res = await request.post('/auth', { data: {} });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ reason: 'Bad credentials' });
  });
});
