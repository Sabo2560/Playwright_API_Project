// spec: specs/booking-api.plan.md
import { test, expect, validBookingPayload, payloadMissing } from '../fixtures';

test.describe('Update Booking (PUT)', () => {
  test('updates booking with valid token auth', async ({ request, createBooking, authToken }) => {
    // 1. Create a booking, obtain a token (setup)
    const { id } = await createBooking();
    const updatedPayload = validBookingPayload({ totalprice: 999, firstname: 'Updated' });

    // 2. Send PUT /booking/:id with a full valid payload and Cookie auth
    const res = await request.put(`/booking/${id}`, {
      data: updatedPayload,
      headers: { Cookie: `token=${authToken}` },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toEqual(updatedPayload);

    // 3. GET /booking/:id to confirm persistence
    const getRes = await request.get(`/booking/${id}`);
    const getBody = await getRes.json();
    expect(getBody).toEqual(updatedPayload);
  });

  test('updates booking with Basic auth header', async ({ request, createBooking }) => {
    // 1. Create a booking (setup)
    const { id } = await createBooking();
    const updatedPayload = validBookingPayload({ lastname: 'BasicAuthUpdated' });

    // 2. Send PUT /booking/:id with a full valid payload and Basic auth instead of a Cookie
    const res = await request.put(`/booking/${id}`, {
      data: updatedPayload,
      headers: { Authorization: 'Basic YWRtaW46cGFzc3dvcmQxMjM=' },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toEqual(updatedPayload);
  });

  const decisionTable = [
    { validAuth: true, bookingExists: true, expectedStatus: 200 },
    { validAuth: true, bookingExists: false, expectedStatus: 405 },
    { validAuth: false, bookingExists: true, expectedStatus: 403 },
    { validAuth: false, bookingExists: false, expectedStatus: 403 },
  ];

  for (const { validAuth, bookingExists, expectedStatus } of decisionTable) {
    test(`auth=${validAuth}, exists=${bookingExists} -> ${expectedStatus}`, async ({
      request,
      createBooking,
      authToken,
    }) => {
      // 1. Create the booking only if this row expects it to exist; otherwise use an out-of-range id
      const id = bookingExists ? (await createBooking()).id : 999999999;
      const headers = validAuth ? { Cookie: `token=${authToken}` } : {};

      // 2. Send PUT /booking/:id per this row's auth/existence combination
      const res = await request.put(`/booking/${id}`, {
        data: validBookingPayload(),
        headers,
      });

      expect(res.status()).toBe(expectedStatus);
    });
  }

  test('rejects update with a missing required field', async ({ request, createBooking, authToken }) => {
    // 1. Create a booking, obtain a token (setup)
    const { id } = await createBooking();

    // 2. Send PUT /booking/:id with valid auth but a payload missing totalprice
    const res = await request.put(`/booking/${id}`, {
      data: payloadMissing('totalprice'),
      headers: { Cookie: `token=${authToken}` },
    });

    // PUT's validator returns 400 on failure (unlike POST's 500 — confirmed in source).
    expect(res.status()).toBe(400);
  });
});
