// spec: specs/booking-api-security.plan.md
import { test, expect, validBookingPayload, ADMIN_CREDENTIALS } from '../fixtures';

test.describe('Authorization Scope', () => {
  test('any valid credential can modify a booking it did not create', async ({ request, createBooking }) => {
    // 1. Using one POST /auth token, create a booking (booking A)
    const firstAuthRes = await request.post('/auth', { data: ADMIN_CREDENTIALS });
    const { token: firstToken } = await firstAuthRes.json();
    const { id } = await createBooking();

    // 2. Using a separately obtained token (simulating a different session),
    //    attempt to modify booking A
    const secondAuthRes = await request.post('/auth', { data: ADMIN_CREDENTIALS });
    const { token: secondToken } = await secondAuthRes.json();
    expect(secondToken).not.toBe(firstToken);

    const res = await request.put(`/booking/${id}`, {
      data: validBookingPayload({ firstname: 'ModifiedByDifferentSession' }),
      headers: { Cookie: `token=${secondToken}` },
    });

    // No per-resource ownership check: the second, unrelated token succeeds.
    expect(res.status()).toBe(200);
  });

  test('booking ids are sequential and enumerable', async ({ createBooking }) => {
    // 1. Create three bookings in sequence
    const first = await createBooking();
    const second = await createBooking();
    const third = await createBooking();

    // Ids are small, monotonically increasing integers — trivially guessable/enumerable,
    // not opaque random identifiers. (Not asserting exact +1 spacing: the suite runs with
    // parallel workers, so another test's booking could land between these three creates —
    // monotonic increase is still enough to prove the id space is sequential and would fail
    // if the API ever switched to random/UUID ids, which is the actual behavior under test.)
    expect(second.id).toBeGreaterThan(first.id);
    expect(third.id).toBeGreaterThan(second.id);
  });
});
