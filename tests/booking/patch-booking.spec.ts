// spec: specs/booking-api.plan.md
import { test, expect, validBookingPayload } from '../fixtures';

test.describe('Partial Update Booking (PATCH)', () => {
  test('partially updates a single field, leaving others unchanged', async ({
    request,
    createBooking,
    authToken,
  }) => {
    // 1. Create a booking, obtain a token (setup)
    const { id, payload: original } = await createBooking();

    // 2. Send PATCH /booking/:id with only firstname changed
    const res = await request.patch(`/booking/${id}`, {
      data: { firstname: 'PatchedName' },
      headers: { Cookie: `token=${authToken}` },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.firstname).toBe('PatchedName');
    // All other fields must remain exactly as originally created.
    expect(body).toEqual({ ...original, firstname: 'PatchedName' });
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
      const headers: Record<string, string> = validAuth ? { Cookie: `token=${authToken}` } : {};

      // 2. Send PATCH /booking/:id with a single-field payload per this row's combination
      const res = await request.patch(`/booking/${id}`, {
        data: { firstname: 'PatchAttempt' },
        headers,
      });

      expect(res.status()).toBe(expectedStatus);
    });
  }

  test('rejects a garbage/unrecognized token, not just a missing one', async ({ request, createBooking }) => {
    // A present-but-invalid token is a different equivalence class from no token at all —
    // the route looks it up in an in-memory session map, so an unrecognized value and an
    // absent one take different code paths even though both currently return 403.
    const { id } = await createBooking();

    const res = await request.patch(`/booking/${id}`, {
      data: { firstname: 'PatchAttempt' },
      headers: { Cookie: 'token=this-token-was-never-issued' },
    });

    expect(res.status()).toBe(403);
  });
});
