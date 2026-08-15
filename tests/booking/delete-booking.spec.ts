// spec: specs/booking-api.plan.md
import { test, expect } from '../fixtures';

test.describe('Delete Booking', () => {
  test('deletes an existing booking with valid auth', async ({ request, createBooking, authToken }) => {
    // 1. Create a booking, obtain a token (setup)
    const { id } = await createBooking();

    // 2. Send DELETE /booking/:id with Cookie auth
    const res = await request.delete(`/booking/${id}`, {
      headers: { Cookie: `token=${authToken}` },
    });
    expect(res.status()).toBe(201);

    // 3. GET /booking/:id to confirm removal
    const getRes = await request.get(`/booking/${id}`);
    expect(getRes.status()).toBe(404);
  });

  const decisionTable = [
    { validAuth: true, bookingExists: true, expectedStatus: 201 },
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

      // 2. Send DELETE /booking/:id per this row's auth/existence combination
      const res = await request.delete(`/booking/${id}`, { headers });

      expect(res.status()).toBe(expectedStatus);
    });
  }

  test('rejects a garbage/unrecognized token, not just a missing one', async ({ request, createBooking }) => {
    // A present-but-invalid token is a different equivalence class from no token at all —
    // the route looks it up in an in-memory session map, so an unrecognized value and an
    // absent one take different code paths even though both currently return 403.
    const { id } = await createBooking();

    const res = await request.delete(`/booking/${id}`, {
      headers: { Cookie: 'token=this-token-was-never-issued' },
    });

    expect(res.status()).toBe(403);
  });

  test('deleting an already-deleted booking fails on the second attempt', async ({
    request,
    createBooking,
    authToken,
  }) => {
    // 1. Create a booking, obtain a token, delete it once successfully
    const { id } = await createBooking();
    const firstDelete = await request.delete(`/booking/${id}`, {
      headers: { Cookie: `token=${authToken}` },
    });
    expect(firstDelete.status()).toBe(201);

    // 2. Send DELETE /booking/:id again for the same, now-deleted id
    const secondDelete = await request.delete(`/booking/${id}`, {
      headers: { Cookie: `token=${authToken}` },
    });

    expect(secondDelete.status()).toBe(405);
  });
});
