# API testing (plan → generate → heal, for HTTP APIs)

This is the API-testing counterpart to [test-generation.md](test-generation.md). That file drives a real
browser through `playwright-cli` refs and snapshots; this one drives `@playwright/test`'s built-in
`request` fixture (`APIRequestContext`) against HTTP endpoints — no browser involved. Use this whenever
the target is a REST/JSON API rather than a page.

---

## 0. ISTQB principles, applied to API testing

These are the foundation-level testing principles, translated into API terms. Keep them in mind while
planning and writing tests, not just as theory:

1. **Testing shows presence of defects, not their absence.** A green suite proves the paths you tested
   work — it does not prove the API is bug-free. Don't stop at the happy path.
2. **Exhaustive testing is impossible.** You cannot test every input combination. Use the test-design
   techniques below (equivalence partitioning, boundary value analysis) to pick a small set of inputs
   that gives high confidence cheaply.
3. **Early testing saves cost.** Write API tests against a contract (OpenAPI/Swagger spec, or documented
   request/response shapes) as soon as it exists — don't wait for a UI to be built on top of it.
4. **Defects cluster.** A handful of endpoints (usually the ones with complex business rules — pricing,
   auth, state transitions) will produce most of the bugs. Weight test effort toward them.
5. **Pesticide paradox.** The same fixed set of requests stops finding new bugs over time. Periodically
   add new equivalence classes, new boundary values, new negative cases.
6. **Testing is context-dependent.** A public read-only API needs different rigor (rate limits, caching,
   versioning) than an internal write-heavy service (concurrency, transactional integrity).
7. **Absence-of-errors fallacy.** An API that returns `200` for every request isn't necessarily correct —
   verify the *content* of the response (schema, values, side effects), not just the status code.

### Test levels for an API project

| Level | What it means for an API | Example |
|---|---|---|
| Component | Single endpoint, isolated | `POST /booking` creates a record with valid data |
| Integration | Endpoints that depend on each other's state | Create a booking, then `GET` it, then `DELETE` it |
| System | Full API surface against a realistic deployment | Auth → CRUD lifecycle → error handling, against the Dockerized instance |

### Test types to cover, per endpoint

- **Functional / positive** — valid input produces the documented success response.
- **Functional / negative** — invalid input produces the documented error response (not a 500, not a hang).
- **Boundary / edge** — empty strings, zero, negative numbers, max-length strings, min/max dates.
- **Security-adjacent** — missing auth, expired/invalid token, wrong role, injection-style payloads in
  string fields (only within the authorized scope of your own test environment).
- **Non-functional (lightweight)** — response time sanity check, response has no unexpected fields leaking
  internal data (e.g. password hashes, internal IDs).

---

## 1. Test-design techniques (pick inputs deliberately)

Don't guess test data. For each field in a request body or query string, apply:

### Equivalence Partitioning (EP)

Split the input domain into classes where every value in a class should behave the same way. Test one
representative per class, not every value.

Example — `totalprice` (expected: positive number):
- Valid class: any positive number → pick `150`
- Invalid class: negative number → pick `-1`
- Invalid class: non-numeric → pick `"abc"`
- Invalid class: null/missing → omit the field

### Boundary Value Analysis (BVA)

Bugs cluster at the edges of a valid range, not in the middle. For a bounded field, test the boundary and
one step on each side.

Example — a `checkin`/`checkout` date range that must be ≤ 30 days apart:
- 30 days apart (valid boundary)
- 31 days apart (just past — should fail)
- 1 day apart (minimum valid)
- checkout before checkin (invalid ordering)

### Decision Table Testing

For business rules with multiple conditions combining, enumerate the combinations explicitly instead of
testing them ad hoc.

Example — `DELETE /booking/{id}`:

| Valid token | Booking exists | Expected result |
|---|---|---|
| Yes | Yes | `201` deleted |
| Yes | No | `404` not found |
| No | Yes | `403` forbidden |
| No | No | `403` forbidden (auth checked before existence) |

### State Transition Testing

For resources with a lifecycle, test the transitions, not just individual states.

Example — a booking's implicit lifecycle: `created → updated → deleted → (gone)`.
- Deleting twice → second delete should `404`, not succeed silently or 500.
- Updating after delete → should `404`/`405`, not resurrect the resource.

---

## 2. Planning: write the spec first

Same discipline as UI planning in [test-generation.md](test-generation.md) — write a spec file before
generating tests, so scenarios are deliberate rather than whatever came to mind while typing.

### 2.0 Check existing coverage first

Before planning, check `specs/` and `tests/` (`Glob`/`Grep`) for a plan or tests that already cover this resource.
Extend/reference an existing plan rather than duplicating it, or explicitly note which scenarios are new.

Save under `specs/<resource>.plan.md`:

```markdown
# <Resource> API Test Plan

## Endpoint Overview

<Base path, auth mechanism, and a one-paragraph description of what the resource represents.>

## Test Scenarios

### 1. <Endpoint> — <method> <path>

#### 1.1. <kebab-case-scenario-name>

**File:** `tests/<resource>/<kebab-case-scenario-name>.spec.ts`
**Technique:** <EP / BVA / decision table / state transition / exploratory>
**Priority:** <Critical / High / Medium / Low>

**Steps:**
  1. <Request to send, with the specific input and why (which equivalence class / boundary)>
    - expect: <status code>
    - expect: <response shape / field values — precise enough that no one has to guess what "correct" means>
  2. <Follow-up request if the scenario chains calls>
    - expect: <outcome>

#### 1.2. <next-scenario>
...
```

Guidelines:

- One scenario = one behavior. Don't fold "create succeeds" and "create fails with bad data" into the
  same test.
- Name scenarios after the behavior, not the mechanics: `rejects-checkout-before-checkin`, not
  `test-date-validation`.
- Every scenario states *why* that input was picked (which EP class, which boundary) — this is what keeps
  the suite intentional instead of a pile of arbitrary requests.
- Cover at minimum: one positive case, one negative case, and one boundary/edge case per endpoint that
  takes input. Pure `GET`/health endpoints just need the positive case plus a not-found case if
  applicable.
- **Tag each scenario's priority** (Critical / High / Medium / Low), risk-based: auth, payment/pricing, and
  data-mutating endpoints outrank read-only or cosmetic ones.
- **Every expected outcome must be specific and verifiable.** "Verify the booking was created" is not
  sufficient — state which fields, which values, which status code. A vague outcome forces generation to
  either hardcode today's observed response (proves nothing about correctness) or write a weak assertion.

---

## 3. Generate: spec → test file

### 3.1 Structure

- **Arrange–Act–Assert** inside every test: set up any prerequisite state (auth token, a resource to act
  on) → make the one request under test → assert on it. Don't bury the request under test among several
  unrelated ones.
- **One behavior per test.** If a test needs a `// and also...` comment, split it.
- Import `{ test, expect } from '@playwright/test'` and use the `request` fixture — never
  `page.request` unless the scenario is specifically about a request triggered by browser interaction.

### 3.2 Test independence

- Every test must be runnable alone and in any order. Never rely on a previous test's side effects.
- If a scenario needs a resource to exist (e.g. testing `GET /booking/{id}`), create it inside that test
  (or a `beforeEach`), don't depend on seed data that might not exist or might have been mutated by
  another test.
- Clean up what you create: delete bookings/resources the test made, in an `afterEach` or at the end of
  the test, so runs stay repeatable and don't accumulate junk state in the API under test.

```ts
import { test, expect } from '@playwright/test';

test.describe('POST /booking — validation', () => {
  test('rejects a negative totalprice', async ({ request }) => {
    // Arrange: build a payload from the invalid equivalence class (EP)
    const payload = {
      firstname: 'Jane',
      lastname: 'Doe',
      totalprice: -1,
      depositpaid: true,
      bookingdates: { checkin: '2026-09-01', checkout: '2026-09-05' },
    };

    // Act
    const res = await request.post('/booking', { data: payload });

    // Assert
    expect(res.status()).toBe(400);
  });
});
```

### 3.3 Auth and shared setup

Put token acquisition in a fixture so every test that needs auth doesn't repeat it:

```ts
// tests/fixtures.ts
import { test as base, expect } from '@playwright/test';

export const test = base.extend<{ authToken: string }>({
  authToken: async ({ request }, use) => {
    const res = await request.post('/auth', {
      data: { username: 'admin', password: 'password123' },
    });
    const { token } = await res.json();
    await use(token);
  },
});
export { expect };
```

```ts
import { test, expect } from './fixtures';

test('deletes a booking with a valid token', async ({ request, authToken }) => {
  // ...
});
```

### 3.4 Assert on substance, not just status

A `200` alone doesn't confirm correctness (absence-of-errors fallacy, above). Assert the response body
shape and values too:

```ts
const res = await request.post('/booking', { data: payload });
expect(res.status()).toBe(200);
const body = await res.json();
expect(body.booking).toMatchObject(payload);   // echoes back what was sent
expect(body.bookingid).toEqual(expect.any(Number));
```

For endpoints with a stable schema, prefer a schema check over field-by-field assertions once the shape is
established — catches unexpected new/missing fields that individual `toMatchObject` calls might miss.

### 3.5 Assertion quality (do not skip this)

- Every assertion must be capable of catching a real regression. Before writing one, ask: "if the API broke,
  would this actually fail?" Reject assertions that pass regardless of behavior, e.g. `expect(res.status()).not
  .toBe(500)` as the *only* check, or `toBeDefined()` on a field the scenario is actually about the value of.
- Where the expected value can be derived from the request you sent (an echoed field, a computed total, a
  count), derive it programmatically rather than hardcoding an observed response value. A hardcoded expected
  value only proves the API matches today's snapshot, not that the underlying logic is correct.
- Prefer specific checks (`toBe`, `toEqual`, `toMatchObject`) over vague presence checks
  (`toBeTruthy()`, `expect(res.ok()).toBeTruthy()` alone) whenever the scenario is about a specific value.

### 3.5 Run generated tests

```bash
npx playwright test tests/<resource>/
```

Any failure goes to Section 4.

---

## 4. Heal: fix failing API tests

### 4.1 Diagnose

API test failures are usually cheaper to diagnose than UI ones — no selector drift, no timing flakiness
from animations. Check, in order:

1. **Is the API under test actually running?** (`curl <baseURL>/ping` or equivalent health check.)
2. **Response body** — log `await res.json()` or `await res.text()` to see what actually came back.
3. **Status code vs. expected** — did the API's contract change, or is the test's expectation wrong?
4. **Test data collision** — did a previous test run leave state behind (e.g. a resource that should have
   been deleted but wasn't due to an earlier failure)? Check for missing cleanup, not just this test.

```ts
const res = await request.post('/booking', { data: payload });
console.log(res.status(), await res.text());   // temporary, remove before committing
```

### 4.1.1 Classify before fixing (do not skip this)

Every failure is one of two kinds, and they require opposite responses:

- **Test bug** — the test's payload, assertion, or setup is wrong, but the API behaves correctly. → Fix the test.
- **Real regression** — the API's actual behavior changed or is wrong (bad status code, wrong computed value,
  missing/changed field, broken state transition), and the test correctly caught it. → Do **not** edit the test
  to match the broken response. Leave the assertion as-is, mark the test `test.fixme()`, and add a comment stating
  what the API actually returned instead of the expected behavior, so a human can triage it as a bug.

Never weaken an assertion just to make it pass (e.g. turning an exact expected value into `toBeGreaterThan(0)` or
dropping a field check) unless you've confirmed the looser check is what the scenario actually intends to verify.
That kind of "fix" is coverage loss disguised as a pass — the regression will never be caught again.

If unsure which kind it is, treat it as a possible regression: apply `test.fixme()` with a clear comment rather
than guessing.

Cap yourself at 5 fix attempts per test. If still failing after 5, stop, apply `test.fixme()` with a comment
summarizing what was tried, and move to the next failing test.

### 4.2 Common causes specific to APIs

- **Contract drift** — the API's request/response shape changed; update the test (and the spec) to match
  if the change was intentional.
- **Auth token expiry/reuse** — a token fixture scoped too broadly (e.g. `worker`-scoped) can go stale
  across a long run; re-check the fixture's scope.
- **Leftover test data** — a prior failed run didn't clean up, so a "create" test now collides with an
  existing resource. Fix the cleanup, then clear any stray data manually if needed.
- **Environment mismatch** — test points at a stale `baseURL` (e.g. the Docker container was rebuilt and
  lost data, or isn't running at all).

### 4.3 Reconcile with the spec

Same rule as UI healing: if the fix only changed test *mechanics* (e.g. an assertion helper), leave the
spec alone. If it changed *behavior* the spec describes (a status code, a required field), update the
spec to match reality — or, if you believe the API itself regressed, stop and ask the user before
"fixing" the test to match a bug.

### 4.4 End-of-run summary (required)

After processing all failing tests, produce a short summary listing, for each test touched:

- Whether it was classified as a test bug (fixed) or a possible regression (`test.fixme()`)
- One line on the root cause
- The file and line changed, if any

This is what a human reviewer reads before merging — it must be enough for them to decide whether to trust each
fix without re-debugging it themselves.

---

## Good habits checklist

- [ ] Every test is independent and cleans up resources it creates.
- [ ] Test names describe behavior, not mechanics.
- [ ] Inputs are chosen deliberately (EP/BVA/decision table), not arbitrary.
- [ ] Both positive and negative cases exist for every endpoint that accepts input.
- [ ] Assertions check response *content*, not just status code.
- [ ] Every assertion could actually fail if the API broke — no vacuous checks.
- [ ] Expected values are derived from the request/state where possible, not hardcoded from an observed response.
- [ ] Scenarios are tagged by risk-based priority (Critical/High/Medium/Low).
- [ ] Auth/setup is in a fixture, not copy-pasted per test.
- [ ] No hardcoded `baseURL` inside test files — it lives in `playwright.config.ts`.
- [ ] No arbitrary `waitForTimeout`/sleep as a fix for flakiness — find the real cause.
- [ ] Failures are classified test-bug vs. regression before any fix is applied.
