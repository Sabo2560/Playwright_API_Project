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
});
