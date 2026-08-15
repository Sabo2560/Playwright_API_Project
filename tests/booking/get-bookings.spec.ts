// spec: specs/booking-api.plan.md
import { test, expect } from '../fixtures';

test.describe('List Bookings', () => {
  test('returns all booking ids, including a newly created one', async ({ request, createBooking }) => {
    // 1. Create one booking (setup, not the behavior under test)
    const { id } = await createBooking();

    // 2. Send GET /booking
    const res = await request.get('/booking');

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body).toEqual(expect.arrayContaining([{ bookingid: id }]));
  });

  test('filters bookings by firstname and lastname', async ({ request, createBooking }) => {
    // 1. Create a booking with a distinctive firstname/lastname pair
    const distinctiveName = `EPTest${Date.now()}`;
    const { id } = await createBooking({ firstname: distinctiveName, lastname: distinctiveName });

    // 2. Send GET /booking filtered by that name
    const matchRes = await request.get(`/booking?firstname=${distinctiveName}&lastname=${distinctiveName}`);
    expect(matchRes.status()).toBe(200);
    const matchBody = await matchRes.json();
    expect(matchBody).toEqual(expect.arrayContaining([{ bookingid: id }]));

    // 3. Send GET /booking filtered by a name guaranteed not to match
    const noMatchRes = await request.get(`/booking?firstname=NonexistentName${Date.now()}`);
    expect(noMatchRes.status()).toBe(200);
    const noMatchBody = await noMatchRes.json();
    expect(noMatchBody).not.toEqual(expect.arrayContaining([{ bookingid: id }]));
  });

  test.fixme(
    'returns a client error for a malformed checkin date filter, not a 500',
    async ({ request }) => {
      // Known defect, confirmed live via
      // `curl "http://localhost:3001/booking?checkin=not-a-date"` -> 500 Internal Server Error.
      // The route parses `checkin`/`checkout` via `new Date(req.query.checkin)` with no
      // validation, so an unparseable value throws instead of producing a 400. This test
      // encodes the correct expected behavior and is marked fixme pending a fix upstream —
      // flip to a live assertion once the route validates its date input.
      const res = await request.get('/booking?checkin=not-a-date');
      expect(res.status()).toBe(400);
    }
  );
});
