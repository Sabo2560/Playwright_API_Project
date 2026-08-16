// spec: specs/booking-api-security.plan.md
import { test, expect } from '../fixtures';

test.describe('Abuse Resistance', () => {
  test.fixme('rate-limits repeated failed auth attempts', async ({ request }) => {
    // Known gap: /auth has no throttling. Kept to 10 attempts against our own local
    // container — enough to demonstrate the absence of rate limiting, not a real
    // brute-force attack. The fix (rate-limiting middleware) belongs upstream.
    const statuses: number[] = [];

    for (let i = 0; i < 10; i++) {
      const res = await request.post('/auth', {
        data: { username: 'admin', password: `wrong-password-${i}` },
      });
      statuses.push(res.status());
    }

    // Correct security posture would start throttling (e.g. 429) after a few failures.
    // Today every attempt responds identically with 200, so this assertion currently fails.
    expect(statuses.some((status) => status !== 200)).toBe(true);
  });
});
