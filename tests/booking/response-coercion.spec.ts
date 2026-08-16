// spec: specs/booking-api.plan.md
import { test, expect, validBookingPayload } from '../fixtures';

test.describe('Response Formatting / Type Coercion', () => {
  test.fixme(
    'coerces a truthy string depositpaid to true instead of respecting its value',
    async ({ request }) => {
      // Known defect, confirmed live: the response formatter passes depositpaid through
      // Boolean(x), so ANY non-empty string is truthy in JavaScript — including the string
      // "false" itself. Sending depositpaid: "false" comes back as depositpaid: true.
      // This test encodes the correct expected behavior and is marked fixme pending a fix
      // upstream in restful-booker's helpers/parser.js.
      const res = await request.post('/booking', {
        data: validBookingPayload({ depositpaid: 'false' as unknown as boolean }),
      });

      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.booking.depositpaid).toBe(false);
    }
  );

  test('coerces an empty string depositpaid to false (the one class that coerces correctly)', async ({
    request,
    trackForCleanup,
  }) => {
    // 1. Send POST /booking with depositpaid as an empty string — Boolean('') is false,
    //    so this is the boundary of the same coercion mechanism that produces the bug
    //    above, but on the side where it happens to match the empty-string equivalence class.
    const res = await request.post('/booking', {
      data: validBookingPayload({ depositpaid: '' as unknown as boolean }),
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.booking.depositpaid).toBe(false);

    trackForCleanup(body.bookingid);
  });

  test.fixme('rejects an invalid checkin date instead of silently corrupting it', async ({ request }) => {
    // Known defect, confirmed live: an invalid checkin string is not rejected on create —
    // it comes back as a garbage value like "0NaN-aN-aN" (via date.format(new Date(invalid))
    // in helpers/parser.js). This is worse than the malformed-filter 500 (see
    // get-bookings.spec.ts) since callers get a 200 and may not notice the field is corrupted.
    // This test encodes the correct expected behavior and is marked fixme pending a fix.
    const res = await request.post('/booking', {
      data: validBookingPayload({ bookingdates: { checkin: 'not-a-date', checkout: '2026-09-05' } }),
    });

    expect(res.status()).toBe(400);
  });

  test('truncates a decimal totalprice via parseInt rather than rounding or rejecting', async ({
    request,
    trackForCleanup,
  }) => {
    // 1. Send POST /booking with a decimal totalprice
    const res = await request.post('/booking', {
      data: validBookingPayload({ totalprice: 150.75 }),
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.booking.totalprice).toBe(150);

    trackForCleanup(body.bookingid);
  });
});
