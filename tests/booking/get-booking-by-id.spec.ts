// spec: specs/booking-api.plan.md
import { test, expect } from '../fixtures';

test.describe('Get Booking by Id', () => {
  test('retrieves a single existing booking', async ({ request, createBooking }) => {
    // 1. Create a booking (setup)
    const { id, payload } = await createBooking();

    // 2. Send GET /booking/:id
    const res = await request.get(`/booking/${id}`);

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toEqual(payload);
  });

  test('returns 404 for a nonexistent booking id', async ({ request }) => {
    // 1. Send GET /booking/:id with an id far outside anything this suite creates
    const res = await request.get('/booking/999999999');

    expect(res.status()).toBe(404);
  });
});
