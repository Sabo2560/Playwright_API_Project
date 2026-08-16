// spec: specs/booking-api.plan.md
import { test, expect, validBookingPayload, bookingToXml, bookingToFormEncoded } from '../fixtures';

test.describe('Content-Type and Accept Header Handling', () => {
  test('creates a booking via XML content type', async ({ request, trackForCleanup }) => {
    // 1. Send POST /booking with Content-Type: text/xml and an XML body
    const payload = validBookingPayload();
    const res = await request.post('/booking', {
      data: bookingToXml(payload),
      headers: { 'Content-Type': 'text/xml' },
    });

    expect(res.status()).toBe(200);
    // Accept defaults to */* (JSON), so the response is still JSON regardless of request encoding.
    const body = await res.json();
    expect(body.booking).toEqual(payload);

    trackForCleanup(body.bookingid);
  });

  test('creates a booking via URL-encoded content type', async ({ request, trackForCleanup }) => {
    // 1. Send POST /booking with Content-Type: application/x-www-form-urlencoded
    const payload = validBookingPayload();
    const res = await request.post('/booking', {
      data: bookingToFormEncoded(payload),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.booking).toEqual(payload);

    trackForCleanup(body.bookingid);
  });

  test('returns an XML response body when Accept is application/xml', async ({ request, createBooking }) => {
    // 1. Create a booking (setup, JSON)
    const { id, payload } = await createBooking();

    // 2. Send GET /booking/:id with Accept: application/xml
    const res = await request.get(`/booking/${id}`, {
      headers: { Accept: 'application/xml' },
    });

    expect(res.status()).toBe(200);
    const xmlBody = await res.text();
    expect(xmlBody).toContain('<booking>');
    expect(xmlBody).toContain(`<firstname>${payload.firstname}</firstname>`);
    expect(xmlBody).toContain(`<lastname>${payload.lastname}</lastname>`);
    expect(xmlBody).toContain(`<checkin>${payload.bookingdates.checkin}</checkin>`);
  });

  test.fixme(
    'sets a Content-Type header that matches the XML body it actually returns',
    async ({ request, createBooking }) => {
      // Known defect, confirmed live: the route builds an XML string via js2xmlparser but
      // never calls res.type('xml') / res.set('Content-Type', ...) before res.send(xmlString).
      // Express defaults a string body's Content-Type to text/html, so genuinely-XML content
      // is served mislabeled as text/html — a real response-correctness defect, not a body
      // content bug (the body itself is correct, see the test above).
      const { id } = await createBooking();

      const res = await request.get(`/booking/${id}`, {
        headers: { Accept: 'application/xml' },
      });

      expect(res.headers()['content-type']).toContain('xml');
    }
  );

  test('returns 418 for an unrecognized Accept header', async ({ request, createBooking, authToken }) => {
    // 1. Create a booking (setup)
    const { id } = await createBooking();

    // 2. Send GET /booking/:id with an Accept value outside the four recognized cases
    const getRes = await request.get(`/booking/${id}`, {
      headers: { Accept: 'text/html' },
    });
    expect(getRes.status()).toBe(418);

    // 3. Send POST /booking with a valid payload and the same unrecognized Accept header.
    // The booking is still created server-side even though the 418 response carries no
    // bookingid, so it's tracked via a distinctive name + lookup rather than trackForCleanup.
    const distinctiveName = `Teapot${Date.now()}`;
    const postRes = await request.post('/booking', {
      data: validBookingPayload({ firstname: distinctiveName, lastname: distinctiveName }),
      headers: { Accept: 'text/html' },
    });
    expect(postRes.status()).toBe(418);

    const lookupRes = await request.get(`/booking?firstname=${distinctiveName}&lastname=${distinctiveName}`);
    const [created] = await lookupRes.json();
    if (created) {
      await request.delete(`/booking/${created.bookingid}`, { headers: { Cookie: `token=${authToken}` } });
    }
  });
});
