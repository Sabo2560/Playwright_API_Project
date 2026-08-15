import { test as base, expect } from '@playwright/test';

export const ADMIN_CREDENTIALS = { username: 'admin', password: 'password123' };

export type BookingPayload = {
  firstname: string;
  lastname: string;
  totalprice: number;
  depositpaid: boolean;
  bookingdates: { checkin: string; checkout: string };
  additionalneeds?: string;
};

export function validBookingPayload(overrides: Partial<BookingPayload> = {}): BookingPayload {
  return {
    firstname: 'Jane',
    lastname: 'Doe',
    totalprice: 150,
    depositpaid: true,
    bookingdates: { checkin: '2026-09-01', checkout: '2026-09-05' },
    additionalneeds: 'Breakfast',
    ...overrides,
  };
}

/** Returns a valid payload with the given top-level or `bookingdates.<field>` key removed. */
export function payloadMissing(field: string): Record<string, unknown> {
  const payload: any = validBookingPayload();
  if (field.startsWith('bookingdates.')) {
    delete payload.bookingdates[field.split('.')[1]];
  } else {
    delete payload[field];
  }
  return payload;
}

type Fixtures = {
  authToken: string;
  trackForCleanup: (bookingId: number) => void;
  createBooking: (overrides?: Partial<BookingPayload>) => Promise<{ id: number; payload: BookingPayload }>;
};

export const test = base.extend<Fixtures>({
  authToken: async ({ request }, use) => {
    const res = await request.post('/auth', { data: ADMIN_CREDENTIALS });
    const { token } = await res.json();
    await use(token);
  },

  // Register a booking id for best-effort deletion after the test, regardless of how it was created.
  // Keeps every test's own cleanup to a one-line call instead of repeating auth+delete boilerplate.
  trackForCleanup: async ({ request }, use) => {
    const createdIds: number[] = [];

    await use((bookingId: number) => {
      createdIds.push(bookingId);
    });

    if (createdIds.length > 0) {
      const authRes = await request.post('/auth', { data: ADMIN_CREDENTIALS });
      const { token } = await authRes.json();
      for (const id of createdIds) {
        await request.delete(`/booking/${id}`, { headers: { Cookie: `token=${token}` } }).catch(() => {});
      }
    }
  },

  createBooking: async ({ request, trackForCleanup }, use) => {
    await use(async (overrides = {}) => {
      const payload = validBookingPayload(overrides);
      const res = await request.post('/booking', { data: payload });
      const body = await res.json();
      trackForCleanup(body.bookingid);
      return { id: body.bookingid, payload };
    });
  },
});

export { expect };
