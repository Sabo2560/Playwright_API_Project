# Booking API Test Plan

**Target:** restful-booker running locally via Docker (`http://localhost:3001`, see project README)
**Existing coverage:** `tests/booking.spec.ts` currently has an ad hoc health check and one combined
create→get→update→delete happy-path test. It doesn't separate concerns (one behavior per test) and has
no negative/boundary coverage. This plan supersedes it — generation will split it into the structure below
rather than duplicate it.

## Application Overview

restful-booker exposes a `Booking` resource (guest name, price, deposit status, check-in/check-out dates,
additional needs) under `/booking`, plus a `/auth` endpoint that issues a token required for `PUT`/`PATCH`/
`DELETE`. `/ping` is a bare health check. All endpoints are backed by a real MongoDB-persisted API (not
mocked), confirmed by reading `routes/index.js`, `helpers/validator.js`, and `helpers/validationrules.js`
directly in the cloned source.

Known real behaviors worth testing deliberately (found in source, not assumed):

- `POST /booking` validates only **presence** of required fields (`firstname`, `lastname`, `totalprice`,
  `depositpaid`, `bookingdates.checkin`, `bookingdates.checkout`) — no type checking. A non-numeric
  `totalprice` (e.g. `"abc"`) is **not** rejected. A missing required field returns **500**, not 400.
- `POST /auth` with bad credentials responds **200** with `{ "reason": "Bad credentials" }` — not 401/403.
- `PUT`/`PATCH`/`DELETE` on a non-existent id, when auth is valid, return **405** (not 404).
- `GET /booking/:id` on a non-existent id returns **404**.
- Auth accepts either a `Cookie: token=<value>` (from `/auth`) or a static `Authorization: Basic
  YWRtaW46cGFzc3dvcmQxMjM=` header (base64 of `admin:password123`) — either satisfies all three protected
  routes.

## Test Scenarios

### 1. Health Check — `GET /ping`

**Priority:** Low (no business logic, but cheap smoke signal that the environment is up)

#### 1.1. returns-201-when-api-is-up

**File:** `tests/booking/health-check.spec.ts`
**Technique:** exploratory (single fixed endpoint, no input space)

**Steps:**
  1. Send `GET /ping`
    - expect: status is `201`

---

### 2. Auth — `POST /auth`

**Priority:** Critical (gates every write operation; a broken token issuance blocks PUT/PATCH/DELETE entirely)

#### 2.1. issues-token-for-valid-credentials

**File:** `tests/booking/auth.spec.ts`
**Technique:** EP (valid credentials class)

**Steps:**
  1. Send `POST /auth` with `{ username: "admin", password: "password123" }`
    - expect: status is `200`
    - expect: response body has a `token` field that is a non-empty string

#### 2.2. rejects-wrong-password-without-error-status

**File:** `tests/booking/auth.spec.ts`
**Technique:** EP (invalid credentials class) — documents real behavior: this API returns 200, not 401

**Steps:**
  1. Send `POST /auth` with `{ username: "admin", password: "wrong-password" }`
    - expect: status is `200` (API does not use HTTP status for auth failure — confirmed in source)
    - expect: response body equals `{ "reason": "Bad credentials" }`, and has no `token` field

#### 2.3. rejects-missing-credentials

**File:** `tests/booking/auth.spec.ts`
**Technique:** BVA (empty/missing class)

**Steps:**
  1. Send `POST /auth` with `{}` (no username/password)
    - expect: status is `200`
    - expect: response body equals `{ "reason": "Bad credentials" }`

---

### 3. Create Booking — `POST /booking`

**Priority:** Critical (entry point for every other scenario; a broken create blocks the whole suite)

#### 3.1. creates-booking-with-valid-payload

**File:** `tests/booking/create-booking.spec.ts`
**Technique:** EP (valid class, all required fields present)

**Steps:**
  1. Send `POST /booking` with a complete valid payload (firstname, lastname, totalprice, depositpaid,
     bookingdates.checkin, bookingdates.checkout, additionalneeds)
    - expect: status is `200`
    - expect: response body has a numeric `bookingid`
    - expect: response body's `booking` object equals the exact payload sent (field-by-field, derived from
      the request — not a hardcoded copy)

#### 3.2. creates-booking-without-optional-additionalneeds

**File:** `tests/booking/create-booking.spec.ts`
**Technique:** EP (optional field omitted)

**Steps:**
  1. Send `POST /booking` with all required fields but no `additionalneeds`
    - expect: status is `200`
    - expect: response body's `booking` object matches the sent fields; `additionalneeds` is absent or empty,
      not an error

#### 3.3. rejects-payload-missing-a-required-field

**File:** `tests/booking/create-booking.spec.ts`
**Technique:** decision table — one row per required field, each tested by omitting exactly that field:

| Missing field | Expected status |
|---|---|
| `firstname` | 500 |
| `lastname` | 500 |
| `totalprice` | 500 |
| `depositpaid` | 500 |
| `bookingdates.checkin` | 500 |
| `bookingdates.checkout` | 500 |

**Steps:**
  1. For each row: send `POST /booking` with a valid payload minus that one field
    - expect: status is `500` (documents the API's actual — arguably wrong — behavior of 500 instead of 400;
      see Heal §4.1.1 if this ever changes to 400, that would be an intentional fix to reconcile, not a bug)

#### 3.4. silently-nulls-non-numeric-totalprice

**File:** `tests/booking/create-booking.spec.ts`
**Technique:** BVA / EP — the presence validator lets a non-numeric string through, but the underlying data
model casts `totalprice` through a numeric schema. **Reconciled after live verification** (original plan
assumed the value would be echoed as-is; the live API instead casts an uncastable string to `null` — a
test-bug in the original expectation, not a regression, confirmed via direct `curl` against the running
instance and fixed in the generated test).

**Steps:**
  1. Send `POST /booking` with `totalprice: "not-a-number"` and all other fields valid
    - expect: status is `200` (not rejected — presence-only validation)
    - expect: response body's `booking.totalprice` is `null` (silently cast, not preserved)

#### 3.5. accepts-checkout-before-checkin

**File:** `tests/booking/create-booking.spec.ts`
**Technique:** BVA (invalid date ordering) — no date-order validation exists in the route/validator, so this
locks in current behavior rather than assuming rejection.

**Steps:**
  1. Send `POST /booking` with `checkin: "2026-09-10"`, `checkout: "2026-09-01"` (checkout before checkin)
    - expect: status is `200` (API performs no ordering check — confirmed in source)
    - expect: response body's `bookingdates` echoes the dates exactly as sent, unmodified

---

### 4. Read Booking(s) — `GET /booking`, `GET /booking/:id`

**Priority:** High (read path is exercised by every other scenario's setup/verification)

#### 4.1. returns-all-booking-ids

**File:** `tests/booking/get-bookings.spec.ts`
**Technique:** exploratory

**Steps:**
  1. Create one booking (setup, not the behavior under test)
  2. Send `GET /booking`
    - expect: status is `200`
    - expect: response is an array of objects each shaped `{ bookingid: number }`
    - expect: the array contains an entry whose `bookingid` equals the one created in step 1

#### 4.2. filters-bookings-by-firstname-and-lastname

**File:** `tests/booking/get-bookings.spec.ts`
**Technique:** EP (query filter valid class)

**Steps:**
  1. Create a booking with a distinctive `firstname`/`lastname` pair (setup)
  2. Send `GET /booking?firstname=<name>&lastname=<name>`
    - expect: status is `200`
    - expect: the returned array contains the booking created in step 1
  3. Send `GET /booking?firstname=<a name guaranteed not to exist>`
    - expect: status is `200`
    - expect: the returned array does not contain the booking from step 1 (and is empty if no other
      matching data exists)

#### 4.3. retrieves-a-single-existing-booking

**File:** `tests/booking/get-booking-by-id.spec.ts`
**Technique:** EP (valid id class)

**Steps:**
  1. Create a booking (setup)
  2. Send `GET /booking/:id` with the created id
    - expect: status is `200`
    - expect: response body equals the exact payload created in step 1 (derived from the request, not
      hardcoded)

#### 4.4. returns-404-for-nonexistent-booking-id

**File:** `tests/booking/get-booking-by-id.spec.ts`
**Technique:** BVA (id space boundary — an id that structurally could exist but doesn't)

**Steps:**
  1. Send `GET /booking/:id` with an id far outside any id created by this suite (e.g. `999999999`)
    - expect: status is `404`

---

### 5. Full Update — `PUT /booking/:id`

**Priority:** Critical (auth-gated write; the decision table below is where auth/existence bugs would hide)

#### 5.1. updates-booking-with-valid-token-auth

**File:** `tests/booking/update-booking.spec.ts`
**Technique:** EP (valid auth + valid existing id)

**Steps:**
  1. Create a booking, then `POST /auth` for a token (setup)
  2. Send `PUT /booking/:id` with a full valid payload and `Cookie: token=<token>`
    - expect: status is `200`
    - expect: response body equals the new payload exactly (derived from the request)
  3. `GET /booking/:id` to confirm persistence
    - expect: response body equals the updated payload, not the original

#### 5.2. updates-booking-with-basic-auth-header

**File:** `tests/booking/update-booking.spec.ts`
**Technique:** EP (alternate valid auth mechanism — same outcome via a different valid input class)

**Steps:**
  1. Create a booking (setup)
  2. Send `PUT /booking/:id` with a full valid payload and `Authorization: Basic YWRtaW46cGFzc3dvcmQxMjM=`
     instead of a Cookie
    - expect: status is `200`
    - expect: response body equals the new payload exactly

#### 5.3. update-auth-and-existence-decision-table

**File:** `tests/booking/update-booking.spec.ts`
**Technique:** decision table

| Valid auth | Booking exists | Expected status |
|---|---|---|
| Yes | Yes | 200 |
| Yes | No | 405 |
| No | Yes | 403 |
| No | No | 403 |

**Steps:** for each row, create the booking only if "Booking exists" is Yes, obtain/omit a token per "Valid
auth", then send `PUT /booking/:id` (using a fabricated far-out-of-range id when "Booking exists" is No)
    - expect: status matches the table exactly

#### 5.4. rejects-update-with-missing-required-field

**File:** `tests/booking/update-booking.spec.ts`
**Technique:** BVA — mirrors 3.3 but for PUT, which validates the same way

**Steps:**
  1. Create a booking, obtain a token (setup)
  2. Send `PUT /booking/:id` with valid auth but a payload missing `totalprice`
    - expect: status is `400` (PUT's validator returns 400 on failure, unlike POST's 500 — confirmed in
      source: `routes/index.js` PUT handler sends 400 on validation failure, POST sends 500)

---

### 6. Partial Update — `PATCH /booking/:id`

**Priority:** Medium (same auth surface as PUT, but no server-side field validation to test)

#### 6.1. partially-updates-a-single-field

**File:** `tests/booking/patch-booking.spec.ts`
**Technique:** EP (valid partial payload)

**Steps:**
  1. Create a booking, obtain a token (setup)
  2. Send `PATCH /booking/:id` with only `{ firstname: "<new name>" }` and a valid token
    - expect: status is `200`
    - expect: response body's `firstname` equals the new value
    - expect: all other fields equal the original values from step 1 (unchanged — this is the behavior that
      distinguishes PATCH from PUT and is worth asserting explicitly)

#### 6.2. patch-auth-and-existence-decision-table

**File:** `tests/booking/patch-booking.spec.ts`
**Technique:** decision table (same shape as 5.3, since PATCH shares the same auth/existence branch)

| Valid auth | Booking exists | Expected status |
|---|---|---|
| Yes | Yes | 200 |
| Yes | No | 405 |
| No | Yes | 403 |
| No | No | 403 |

**Steps:** same structure as 5.3, using PATCH with a single-field payload
    - expect: status matches the table exactly

---

### 7. Delete Booking — `DELETE /booking/:id`

**Priority:** Critical (irreversible; auth bypass here is the highest-impact bug this API could have)

#### 7.1. deletes-an-existing-booking-with-valid-auth

**File:** `tests/booking/delete-booking.spec.ts`
**Technique:** EP (valid class)

**Steps:**
  1. Create a booking, obtain a token (setup)
  2. Send `DELETE /booking/:id` with `Cookie: token=<token>`
    - expect: status is `201`
  3. `GET /booking/:id` to confirm removal
    - expect: status is `404`

#### 7.2. delete-auth-and-existence-decision-table

**File:** `tests/booking/delete-booking.spec.ts`
**Technique:** decision table

| Valid auth | Booking exists | Expected status |
|---|---|---|
| Yes | Yes | 201 |
| Yes | No | 405 |
| No | Yes | 403 |
| No | No | 403 |

**Steps:** for each row, create the booking only if "Booking exists" is Yes, obtain/omit a token per "Valid
auth", then send `DELETE /booking/:id`
    - expect: status matches the table exactly

#### 7.3. state-transition-double-delete-fails

**File:** `tests/booking/delete-booking.spec.ts`
**Technique:** state transition (created → deleted → deleted again)

**Steps:**
  1. Create a booking, obtain a token, delete it once successfully (setup, asserting the first delete is 201)
  2. Send `DELETE /booking/:id` again for the same, now-deleted id, with the same valid token
    - expect: status is `405` (not a silent 201 / not a 500 — the "exists" branch correctly evaluates false
      on the second attempt)

---

## Cross-references

- Generation and healing process: [../.claude/skills/playwright-cli/references/api-testing.md](../.claude/skills/playwright-cli/references/api-testing.md)
- Auth token acquisition should be pulled into a shared fixture during generation (see api-testing.md §3.3),
  not repeated per test.
