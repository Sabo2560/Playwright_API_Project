// spec: specs/booking-api.plan.md
import { test, expect, validBookingPayload, payloadMissing } from '../fixtures';

test.describe('Create Booking', () => {
  test('creates booking with valid payload', async ({ request, trackForCleanup }) => {
    // 1. Send POST /booking with a complete valid payload
    const payload = validBookingPayload();
    const res = await request.post('/booking', { data: payload });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(typeof body.bookingid).toBe('number');
    expect(body.booking).toEqual(payload);

    trackForCleanup(body.bookingid);
  });

  test('creates booking without optional additionalneeds', async ({ request, trackForCleanup }) => {
    // 1. Send POST /booking with all required fields but no additionalneeds
    const { additionalneeds, ...payload } = validBookingPayload();
    const res = await request.post('/booking', { data: payload });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.booking).toMatchObject(payload);
    // toMatchObject alone would still pass if the API leaked a stray additionalneeds
    // value, since it only checks listed keys — assert its actual absence explicitly.
    expect(body.booking).not.toHaveProperty('additionalneeds');

    trackForCleanup(body.bookingid);
  });

  for (const field of [
    'firstname',
    'lastname',
    'totalprice',
    'depositpaid',
    'bookingdates.checkin',
    'bookingdates.checkout',
  ]) {
    test(`rejects payload missing required field: ${field}`, async ({ request }) => {
      // 1. Send POST /booking with a valid payload minus this one required field
      const res = await request.post('/booking', { data: payloadMissing(field) });

      // Documents real behavior: this API returns 500 (not 400) on a missing required field.
      expect(res.status()).toBe(500);
    });
  }

  test('silently nulls a non-numeric totalprice instead of rejecting it', async ({ request, trackForCleanup }) => {
    // 1. Send POST /booking with totalprice as a string — the presence validator lets it through,
    //    but the underlying data model casts it through a numeric schema, which turns an
    //    uncastable string into null rather than preserving or rejecting it.
    const payload = validBookingPayload({ totalprice: 'not-a-number' as unknown as number });
    const res = await request.post('/booking', { data: payload });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.booking.totalprice).toBeNull();

    trackForCleanup(body.bookingid);
  });

  test('accepts checkout date before checkin date (no ordering validation)', async ({ request, trackForCleanup }) => {
    // 1. Send POST /booking with checkout earlier than checkin
    const payload = validBookingPayload({
      bookingdates: { checkin: '2026-09-10', checkout: '2026-09-01' },
    });
    const res = await request.post('/booking', { data: payload });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.booking.bookingdates).toEqual(payload.bookingdates);

    trackForCleanup(body.bookingid);
  });
});
