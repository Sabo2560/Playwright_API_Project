// spec: specs/booking-api.plan.md
import { test, expect } from '../fixtures';

test.describe('Routing / Cross-cutting', () => {
  test('returns 404 for a completely unknown route', async ({ request }) => {
    const res = await request.get('/this-route-does-not-exist');
    expect(res.status()).toBe(404);
  });

  test('returns 404 for an unsupported method on a known path', async ({ request }) => {
    const res = await request.fetch('/booking', { method: 'TRACE' });
    expect(res.status()).toBe(404);
  });
});
