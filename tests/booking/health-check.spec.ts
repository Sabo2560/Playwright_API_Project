// spec: specs/booking-api.plan.md
import { test, expect } from '@playwright/test';

test.describe('Health Check', () => {
  test('returns 201 when API is up', async ({ request }) => {
    // 1. Send GET /ping
    const res = await request.get('/ping');
    expect(res.status()).toBe(201);
  });
});
