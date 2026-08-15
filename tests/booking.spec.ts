import { test, expect } from '@playwright/test';

const credentials = { username: 'admin', password: 'password123' };

test.describe('restful-booker /booking CRUD', () => {
  test('health check', async ({ request }) => {
    const res = await request.get('/ping');
    expect(res.status()).toBe(201);
  });

  test('create, read, update, and delete a booking', async ({ request }) => {
    const newBooking = {
      firstname: 'Saad',
      lastname: 'Bouzaidi',
      totalprice: 150,
      depositpaid: true,
      bookingdates: {
        checkin: '2026-09-01',
        checkout: '2026-09-05',
      },
      additionalneeds: 'Breakfast',
    };

    const createRes = await request.post('/booking', { data: newBooking });
    expect(createRes.status()).toBe(200);
    const created = await createRes.json();
    expect(created.booking).toMatchObject(newBooking);
    const bookingId = created.bookingid;

    const getRes = await request.get(`/booking/${bookingId}`);
    expect(getRes.status()).toBe(200);
    expect(await getRes.json()).toMatchObject(newBooking);

    const authRes = await request.post('/auth', { data: credentials });
    expect(authRes.status()).toBe(200);
    const { token } = await authRes.json();

    const updatedBooking = { ...newBooking, totalprice: 200 };
    const updateRes = await request.put(`/booking/${bookingId}`, {
      data: updatedBooking,
      headers: { Cookie: `token=${token}` },
    });
    expect(updateRes.status()).toBe(200);
    expect(await updateRes.json()).toMatchObject(updatedBooking);

    const deleteRes = await request.delete(`/booking/${bookingId}`, {
      headers: { Cookie: `token=${token}` },
    });
    expect(deleteRes.status()).toBe(201);

    const getAfterDeleteRes = await request.get(`/booking/${bookingId}`);
    expect(getAfterDeleteRes.status()).toBe(404);
  });
});
