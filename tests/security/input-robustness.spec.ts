// spec: specs/booking-api-security.plan.md
import { test, expect, validBookingPayload } from '../fixtures';

test.describe('Input Robustness Against Injection-Shaped Strings', () => {
  const injectionShapedPayloads = [
    { label: 'script tag', value: '<script>alert(1)</script>' },
    { label: 'SQL comment syntax', value: "'; DROP TABLE bookings; --" },
    { label: 'NoSQL-operator-shaped string', value: '{"$ne": null}' },
    { label: 'very long string (5000 chars)', value: 'A'.repeat(5000) },
  ];

  for (const { label, value } of injectionShapedPayloads) {
    test(`safely stores and echoes an injection-shaped firstname: ${label}`, async ({
      request,
      trackForCleanup,
    }) => {
      const res = await request.post('/booking', {
        data: validBookingPayload({ firstname: value }),
      });

      expect(res.status()).toBe(200);
      const body = await res.json();
      // Stored and echoed verbatim as inert data — not executed, not mangled, not crashing the API.
      expect(body.booking.firstname).toBe(value);

      trackForCleanup(body.bookingid);
    });
  }

  test('ignores unexpected extra fields in the payload (mass assignment resistance)', async ({
    request,
    trackForCleanup,
  }) => {
    const res = await request.post('/booking', {
      data: { ...validBookingPayload(), isAdmin: true, role: 'admin' },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.booking).not.toHaveProperty('isAdmin');
    expect(body.booking).not.toHaveProperty('role');

    trackForCleanup(body.bookingid);
  });
});
