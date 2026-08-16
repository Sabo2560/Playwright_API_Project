// spec: specs/booking-api-security.plan.md
import { test, expect, validBookingPayload } from '../fixtures';

test.describe('Session / Token Design Characteristics', () => {
  test('token remains valid across many requests, with no expiry', async ({
    request,
    createBooking,
    authToken,
  }) => {
    // 1. Obtain a token via POST /auth (authToken fixture)
    // 2. Use it for a PUT on a freshly created booking
    const { id: firstId } = await createBooking();
    const putRes = await request.put(`/booking/${firstId}`, {
      data: validBookingPayload({ firstname: 'FirstUse' }),
      headers: { Cookie: `token=${authToken}` },
    });
    expect(putRes.status()).toBe(200);

    // 3. Use the same token for an unrelated DELETE on a different booking
    const { id: secondId } = await createBooking();
    const deleteRes = await request.delete(`/booking/${secondId}`, {
      headers: { Cookie: `token=${authToken}` },
    });
    expect(deleteRes.status()).toBe(201);

    // 4. Use the same token a third time for another PUT
    const { id: thirdId } = await createBooking();
    const secondPutRes = await request.put(`/booking/${thirdId}`, {
      data: validBookingPayload({ firstname: 'ThirdUse' }),
      headers: { Cookie: `token=${authToken}` },
    });
    // No single-use/rotation policy: the token has not been invalidated by prior use.
    expect(secondPutRes.status()).toBe(200);
  });

  test('no endpoint exists to revoke a token', async ({ request, authToken }) => {
    // 1. Obtain a token (authToken fixture)
    // 2. Send POST /auth/logout — a plausible but nonexistent path
    const logoutRes = await request.post('/auth/logout', {
      headers: { Cookie: `token=${authToken}` },
    });
    expect(logoutRes.status()).toBe(404);

    // 3. Send DELETE /auth with the token
    const deleteAuthRes = await request.delete('/auth', {
      headers: { Cookie: `token=${authToken}` },
    });
    expect(deleteAuthRes.status()).toBe(404);
  });
});
