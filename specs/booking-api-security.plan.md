# Booking API Security Test Plan

**Target:** restful-booker running locally via Docker (`http://localhost:3001`)
**Scope note:** this is authorized testing against a locally hosted instance of an intentionally-simple
practice API, for learning security-adjacent API testing technique per
[api-testing.md](../.claude/skills/playwright-cli/references/api-testing.md) §0 ("Security-adjacent" test
type). It is not a penetration test, does not attempt exploitation beyond confirming/documenting behavior,
and every scenario below runs against your own local container — never against the public
`restful-booker.herokuapp.com` instance.

**Existing coverage check:** `specs/booking-api.plan.md` groups 2, 5, 6, 7 already cover missing-auth and
garbage-token cases as part of functional CRUD testing (§5.5/6.3/7.4). This plan does not repeat those —
it covers session/token *design* characteristics, authorization scope, information disclosure, input
robustness, and abuse resistance, none of which the functional plan touches.

**Target folder for generated tests:** `tests/security/` (separate from `tests/booking/`, since this is a
distinct testing *concern* — security posture — not another functional resource group).

## Application Overview

Read directly from source (`routes/index.js`, `app.js`) rather than assumed, and confirmed live:

- Auth tokens are stored in an in-memory object (`globalLogins[token] = true`) with **no expiry field, no
  TTL, and no revocation endpoint** — once issued, a token is valid until the server process restarts.
- The Basic-auth alternative (`Authorization: Basic YWRtaW46cGFzc3dvcmQxMjM=`) is a **static, hardcoded
  credential** documented in the API's own public apidoc — it never rotates.
- There is **no per-resource ownership model**: any valid credential (token or the static Basic-auth
  header) can read, update, or delete *any* booking, not just ones created via that session.
- Booking ids are **sequential integers**, trivially enumerable (confirmed live: three consecutive creates
  produced ids 57, 58, 59).
- `app.js` registers no security-header middleware (no helmet-equivalent) and no CORS middleware.

## Test Scenarios

### 1. Session / Token Design Characteristics

**Priority:** Medium (informational — these are design choices appropriate for a practice API, but the
kind of thing that would be a real finding in a production system, and worth knowing how to test for)

#### 1.1. token-remains-valid-across-many-requests-with-no-expiry

**File:** `tests/security/token-lifecycle.spec.ts`
**Technique:** exploratory — confirms the documented absence of expiry by exercising a single token across
multiple, temporally-separated write operations rather than assuming from source alone.

**Steps:**
  1. Obtain a token via `POST /auth`
  2. Use that same token for a `PUT /booking/:id` on a freshly created booking
    - expect: status is `200`
  3. Use the same token again for an unrelated `DELETE /booking/:id` on a different booking
    - expect: status is `201`
  4. Use the same token a third time for another `PUT /booking/:id`
    - expect: status is `200` (token has not been invalidated by prior use — no single-use/rotation policy)

#### 1.2. no-endpoint-exists-to-revoke-a-token

**File:** `tests/security/token-lifecycle.spec.ts`
**Technique:** exploratory — confirms the route table (verified via `grep` over `routes/index.js`) has no
logout/revoke route by probing the plausible paths.

**Steps:**
  1. Obtain a token via `POST /auth`
  2. Send `POST /auth/logout` (a plausible but nonexistent path)
    - expect: status is `404`
  3. Send `DELETE /auth` with the token
    - expect: status is `404`
    - (documents that a token, once issued, cannot be explicitly invalidated by a client — only a server
      restart clears `globalLogins`)

---

### 2. Authorization Scope (no per-resource ownership)

**Priority:** Medium (informational — expected given this API's single-admin design, but the exact kind of
gap "any authenticated user can touch any resource" testing exists to surface)

#### 2.1. any-valid-credential-can-modify-a-booking-it-did-not-create

**File:** `tests/security/authorization-scope.spec.ts`
**Technique:** exploratory

**Steps:**
  1. Using one `POST /auth` token, create a booking (booking A)
  2. Using a *separately obtained* `POST /auth` token (simulating a different session), send
     `PUT /booking/:id` for booking A
    - expect: status is `200` — the second token succeeds even though it never created booking A,
      confirming there is no per-resource ownership check (both tokens are equally privileged; this is a
      characteristic of the admin-only design, not a bug, but worth locking in as documented behavior)

#### 2.2. booking-ids-are-sequential-and-enumerable

**File:** `tests/security/authorization-scope.spec.ts`
**Technique:** BVA (id predictability, not a value-range boundary — same spirit as classic BVA in that
we're probing the shape of the id space rather than guessing)

**Steps:**
  1. Create three bookings in sequence
    - expect: their `bookingid` values are consecutive integers (documents that ids are trivially
      guessable — combined with 2.1's lack of ownership checks, this means booking data is only as private
      as the id is hard to guess, which it is not)

---

### 3. Input Robustness Against Injection-Shaped Strings

**Priority:** High (these are the scenarios most likely to reveal an actual crash or unsafe handling, not
just a design characteristic)

#### 3.1. safely-stores-and-echoes-injection-shaped-strings

**File:** `tests/security/input-robustness.spec.ts`
**Technique:** EP — a distinct equivalence class of string input: values shaped like common injection
payloads (script tags, template-literal-like syntax, NoSQL-operator-shaped JSON strings, SQL-comment
syntax). The API stores data via LokiJS (an in-process JS store, not a SQL/Mongo server reachable via query
syntax injection), so the realistic risk here is a crash or unescaped reflection, not classic SQLi/NoSQLi.

**Steps:** for each payload below, send `POST /booking` with it as `firstname`, all other fields valid:
  - `<script>alert(1)</script>`
  - `'; DROP TABLE bookings; --`
  - `{"$ne": null}` (as a literal string value, not a JSON object)
  - A firstname 5,000 characters long (boundary: very long string)
    - expect: status is `200` for every payload (no crash / 500)
    - expect: response body's `booking.firstname` equals the exact payload sent, verbatim (stored as inert
      data, not executed or mangled — confirms the API treats these as plain strings, which is correct
      behavior for a JSON API with no server-side templating of user input)

#### 3.2. ignores-unexpected-extra-fields-in-the-payload (mass assignment resistance)

**File:** `tests/security/input-robustness.spec.ts`
**Technique:** EP — confirms a positive security control, not a defect. Confirmed live: extra fields are
silently dropped, not stored or reflected.

**Steps:**
  1. Send `POST /booking` with a valid payload plus extra unexpected fields (e.g. `isAdmin: true`,
     `role: "admin"`)
    - expect: status is `200`
    - expect: response body's `booking` object does not contain `isAdmin` or `role` at all (mass
      assignment did not succeed — locks in this safe behavior so a future regression would be caught)

---

### 4. Information Disclosure

**Priority:** Medium — none of these are exploitable on their own, but each is a standard item on an API
security checklist, and this project is a reasonable place to practice testing for them.

#### 4.1. missing-recommended-security-headers (defect/improvement, not originally planned)

**File:** `tests/security/response-headers.spec.ts`
**Technique:** exploratory — confirmed live via `curl -D -`: no `X-Content-Type-Options`,
`X-Frame-Options`, `Strict-Transport-Security`, or `Content-Security-Policy` headers are present on any
response.
**Status:** Real gap against standard baseline (OWASP API security header recommendations), not a test bug.
Marked `test.fixme()` — the fix belongs in `app.js` (e.g. adding `helmet`), out of scope for this test repo
to patch upstream.

**Steps:**
  1. Send `GET /ping`
    - expect: response headers include `x-content-type-options: nosniff` (currently fails — header absent)

#### 4.2. exposes-technology-stack-via-x-powered-by-header (defect/improvement, not originally planned)

**File:** `tests/security/response-headers.spec.ts`
**Technique:** exploratory — confirmed live: `X-Powered-By: Express` is present on every response,
identifying the exact framework to any client, which is a minor but standard "don't announce your stack"
finding.
**Status:** Real gap, marked `test.fixme()` — one-line fix is `app.disable('x-powered-by')` upstream.

**Steps:**
  1. Send `GET /ping`
    - expect: `x-powered-by` header is absent (currently fails — actual value is `Express`)

#### 4.3. malformed-json-body-does-not-leak-a-stack-trace

**File:** `tests/security/response-headers.spec.ts`
**Technique:** BVA (malformed-body boundary) — confirms *safe* behavior, not a defect. Confirmed live:
sending unparseable JSON returns a generic `400 Bad Request` with no stack trace or internal detail.

**Steps:**
  1. Send `POST /booking` with a syntactically invalid JSON body and `Content-Type: application/json`
    - expect: status is `400`
    - expect: response body does not contain any of: a file path, the word `at ` (stack frame marker), or
      `node_modules` (i.e., no leaked stack trace)

---

### 5. Abuse Resistance

**Priority:** Medium — genuine gap, but keep this scenario small and clearly scoped; this is not a real
brute-force attack, just confirming the *absence* of throttling with a handful of requests against your own
local container.

#### 5.1. no-rate-limiting-on-repeated-failed-auth-attempts (defect/improvement, not originally planned)

**File:** `tests/security/rate-limiting.spec.ts`
**Technique:** exploratory
**Status:** Real gap (no brute-force protection on `/auth`), not a test bug. Kept to 10 attempts —
enough to demonstrate the absence of throttling without functioning as an actual attack. Marked
`test.fixme()`; the fix (rate limiting middleware) belongs upstream.

**Steps:**
  1. Send `POST /auth` with an incorrect password, 10 times in a row
    - expect: none of the 10 responses is a `429` or any status other than `200` (currently fails the
      *intent* of this test, since the correct security posture would be to start throttling after a few
      failed attempts — encodes the desired behavior as `expect(res.status()).not.toBe(200)` on at least
      one of the later attempts, marked fixme since today all 10 succeed identically)

---

## Cross-references

- Generation and healing process: [../.claude/skills/playwright-cli/references/api-testing.md](../.claude/skills/playwright-cli/references/api-testing.md)
- Functional auth/decision-table coverage (missing/garbage token on write endpoints): `specs/booking-api.plan.md` §5.5, §6.3, §7.4 — not duplicated here.
- Shared fixtures (`authToken`, `createBooking`, `trackForCleanup`, `validBookingPayload`) live in `tests/fixtures.ts` and should be reused by generated security tests rather than re-implemented.
