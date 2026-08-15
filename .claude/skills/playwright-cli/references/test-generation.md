# Test generation (plan → generate → heal)

End-to-end workflow for authoring and maintaining Playwright tests with `playwright-cli`. Every `playwright-cli` action emits the equivalent Playwright TypeScript, and that generated code is the raw material for every test. The sections below can be used independently:

- **How generation works** — the core mechanic everything else relies on: actions become TypeScript, plus how to add assertions.
- **Plan** — explore the app, produce a spec file describing what to test.
- **Generate** — turn a spec into Playwright test files. Update the spec if it's vague or stale.
- **Heal** — diagnose failing tests, fix the code, reconcile the spec with reality.

Plan / generate / heal lean on the same mechanic: run `npx playwright test --debug=cli` in the background, then `playwright-cli attach tw-XXXX` to drive the paused page interactively. See [playwright-tests.md](playwright-tests.md) for the debug/attach mechanics.

---

## 0. How generation works

Every action you perform with `playwright-cli` generates corresponding Playwright TypeScript code. This code appears in the output and can be copied directly into your test files.

```bash
# Start a session
playwright-cli open https://example.com/login

# Take a snapshot to see elements
playwright-cli snapshot
# Output shows: e1 [textbox "Email"], e2 [textbox "Password"], e3 [button "Sign In"]

# Fill form fields - generates code automatically
playwright-cli fill e1 "user@example.com"
# Ran Playwright code:
# await page.getByRole('textbox', { name: 'Email' }).fill('user@example.com');

playwright-cli fill e2 "password123"
# Ran Playwright code:
# await page.getByRole('textbox', { name: 'Password' }).fill('password123');

playwright-cli click e3
# Ran Playwright code:
# await page.getByRole('button', { name: 'Sign In' }).click();
```

### Building a test file

Collect the generated code into a Playwright test:

```typescript
import { test, expect } from '@playwright/test';

test('login flow', async ({ page }) => {
  // Generated code from playwright-cli session:
  await page.goto('https://example.com/login');
  await page.getByRole('textbox', { name: 'Email' }).fill('user@example.com');
  await page.getByRole('textbox', { name: 'Password' }).fill('password123');
  await page.getByRole('button', { name: 'Sign In' }).click();

  // Add assertions
  await expect(page).toHaveURL(/.*dashboard/);
});
```

### Use semantic locators

The generated code uses role-based locators when possible, which are more resilient:

```typescript
// Generated (good - semantic)
await page.getByRole('button', { name: 'Submit' }).click();

// Avoid (fragile - CSS selectors)
await page.locator('#submit-btn').click();
```

### Explore before recording

Take snapshots to understand the page structure before recording actions:

```bash
playwright-cli open https://example.com
playwright-cli snapshot
# Review the element structure
playwright-cli click e5
```

### Add assertions manually

Generated code captures actions but not assertions. Add expectations in your test using one of the recommended matchers:

- `toBeVisible()` — element is rendered and visible
- `toHaveText(text)` — element text content matches
- `toHaveValue(value) / toBeEmpty()` — input/select value matches
- `toBeChecked() / toBeUnchecked()` — checkbox state matches
- `toMatchAriaSnapshot(snapshot)` — page (or locator) matches a partial accessibility snapshot

Use `playwright-cli generate-locator <target>` to produce the locator expression for the assertion, and the snapshot/eval commands to capture the expected value.

When asserting text content, make sure that generated locator does not contain text from the element itself. `getByTestId()` or `getByLabel()` usually work well with asserting text. When locator is text-based, prefer `toBeVisible()` instead.

Snapshot to be matched does not have to contain all the information - only capture what's necessary for the assertion. You can use regular expressions for unstable values.

```bash
# Get a stable locator for an element ref to use in the assertion
playwright-cli --raw generate-locator e5
# getByRole('button', { name: 'Submit' })

# Capture expected text content for toHaveText
playwright-cli --raw eval "el => el.textContent" e5

# Capture expected input value for toHaveValue/toBeEmpty
playwright-cli --raw eval "el => el.value" e5

# Capture expected aria snapshot for toMatchAriaSnapshot/toBeChecked
# (whole page, or use a ref to scope to a region)
playwright-cli --raw snapshot
playwright-cli --raw snapshot e5
```

```typescript
// Generated action
await page.getByRole('button', { name: 'Submit' }).click();

// Manual assertions using the outputs above:
await expect(page.getByRole('alert', { name: 'Success' })).toBeVisible();
await expect(page.getByTestId('main-header')).toHaveText('Welcome, user');
await expect(page.getByRole('textbox', { name: 'Email' })).toHaveValue('user@example.com');
await expect(page.getByRole('checkbox', { name: 'Enable notifications' })).toBeChecked();

// toMatchAriaSnapshot on the whole page, finds a matching region
await expect(page).toMatchAriaSnapshot(`
  - heading "Welcome, user"
  - link /\\d+ new messages?/
  - button "Sign out"
`);

// toMatchAriaSnapshot scoped to a region
await expect(page.getByRole('navigation')).toMatchAriaSnapshot(`
  - link "Home"
  - link /\\d+ new messages?/
  - link "Profile"
`);
```

---

## 1. Planning

Goal: produce a spec file (e.g. `specs/<feature>.plan.md`) that enumerates the scenarios to test. **Always** write the spec to a file.

### 1.0 Check existing coverage first

Before exploring, check `specs/` and `tests/` (`Glob`/`Grep`) for plans or tests that already cover this area. If
found, extend/reference the existing plan rather than duplicating it, or explicitly note in the new plan which
scenarios are new versus already covered elsewhere.

### 1.1 Prerequisite: workspace

Check the workspace has Playwright installed before anything else:

```bash
# Either of these confirms a workspace:
test -f playwright.config.ts || test -f playwright.config.js
npx --no-install playwright --version
```

If there is no Playwright install, bootstrap one and let the user pick the defaults:

```bash
npm init playwright@latest
```

### 1.2 Prerequisite: seed test

A **seed test** is a minimal test that lands the page in the state every scenario starts from: navigation to the app, any required login, feature flags, etc. Scenarios assume a fresh start *after* the seed. `--debug=cli` pauses *inside* this test, so the seed is where every planning and generation session begins.

Minimum viable seed:

```ts
// tests/seed.spec.ts
import { test } from '@playwright/test';

test('seed', async ({ page }) => {
  await page.goto('https://example.com/');
});
```

Preferred — push navigation into a fixture so scenario tests reuse it:

```ts
// tests/fixtures.ts
import { test as baseTest } from '@playwright/test';
export { expect } from '@playwright/test';

export const test = baseTest.extend({
  page: async ({ page }, use) => {
    await page.goto('https://example.com/');
    await use(page);
  },
});
```

```ts
// tests/seed.spec.ts
import { test } from './fixtures';

test('seed', async ({ page }) => {
  // Fixture already navigates. This empty body tells agents where to start.
});
```

If no seed exists, create one that at least navigates to the app.

### 1.3 Explore the app

Launch the app via the seed in the background and attach:

```bash
PLAYWRIGHT_HTML_OPEN=never npx playwright test tests/seed.spec.ts --debug=cli
# wait for "Debugging Instructions" and the session name tw-XXXX
playwright-cli attach tw-XXXX
```

Resume so the seed runs, then probe the app:

```bash
playwright-cli resume                   # resume so that seed test runs fully
playwright-cli snapshot                 # inventory of interactive elements
playwright-cli click e5                 # follow a flow
playwright-cli eval "location.href"     # read URL / state
playwright-cli show --annotate          # ask the user to point at something
```

Map out:

- Interactive surfaces (forms, buttons, lists, filters, modals).
- Primary user journeys end-to-end.
- Edge cases: empty states, validation errors, very long input, boundary values.
- Persistence: reload, local/session storage, URL fragments.
- Navigation: which controls change the URL, back/forward behaviour.

Use `playwright-cli requests` while exploring to note whether each feature is backed by a real network call or is
purely client-side. Record this in the plan — it determines whether API-level test coverage ([api-testing.md](api-testing.md))
is applicable at all, and prevents generating a test that assumes an API exists where there isn't one.

When a feature's exact behavior isn't obvious from one interaction (a randomized delay, a default state, what a
control does when triggered), interact with it more than once to confirm before writing it into the plan as fact.
If still ambiguous after that, mark it explicitly in the plan rather than guessing.

**Important**: Do not just open the app url with playwright-cli, always go through the test to capture any custom setup done there.
**Important**: Stop the background test when done exploring.

### 1.4 Write the spec file

Save under `specs/<feature>.plan.md`. Use this structure:

```markdown
# <Feature> Test Plan

## Application Overview

<One paragraph describing what the feature does and why it matters.>

## Test Scenarios

### 1. <Group Name>

**Seed:** `tests/seed.spec.ts`

#### 1.1. <kebab-case-scenario-name>

**File:** `tests/<group>/<kebab-case-scenario-name>.spec.ts`
**Priority:** <Critical / High / Medium / Low>

**Steps:**
  1. <Concrete user step>
    - expect: <observable outcome, precise enough that no one has to guess what "correct" means>
    - expect: <another observable outcome>
  2. <Next step>
    - expect: <outcome>

#### 1.2. <next-scenario>
...

### 2. <Next Group>

**Seed:** `tests/seed.spec.ts`
...
```

Guidelines:

- Each scenario is independent and starts from the seed's fresh state — never chain scenarios.
- Scenario names are kebab-case and match the test file name (`should-add-single-todo` → `should-add-single-todo.spec.ts`).
- Cover happy path, edge cases, validation, negative flows, persistence.
- Write steps at the user level ("Type 'Buy milk' into the input"), not the API level ("call `fill`").
- Put observable outcomes in `- expect:` bullets; each becomes an assertion during generation.
- **Tag each scenario's priority** (Critical / High / Medium / Low) based on the impact of that flow breaking —
  risk-based, not a flat list. Data-integrity and core-transaction paths outrank cosmetic or rarely-used ones.
- **Every expected outcome must be specific and verifiable.** "Verify the total is correct" is not sufficient —
  state what "correct" means precisely enough that generation doesn't have to guess, e.g. "the displayed total
  equals the sum of (quantity × price) across all rows." A vague outcome forces the generator to either hardcode
  today's observed value (proves nothing about the underlying logic) or write a weak assertion that passes
  regardless of behavior.
- For any input with more than 2-3 meaningful states or combinations (e.g. multiple filters applied together),
  consider whether a decision table would surface combinations a flat scenario list would miss.
- State starting-state assumptions explicitly (always assume blank/fresh state), and say so if the actual default
  couldn't be confirmed during exploration rather than assuming a plausible-sounding one.

---

## 2. Generate

Goal: take a spec file and produce Playwright test files. Optionally update the spec if it has drifted.

### 2.1 Inputs

- **Spec file**, e.g. `specs/basic-operations.plan.md`.
- **Target**: either a single scenario (e.g. `1.2`), a whole group (`1`), or all.
- **Seed file**, read from the `**Seed:**` line of the scenario's group.

### 2.2 Generate one scenario

For each target scenario, in sequence (never in parallel — scenarios share the seed session):

```bash
PLAYWRIGHT_HTML_OPEN=never npx playwright test <seed-file> --debug=cli   # background
playwright-cli attach tw-XXXX
# resume
```

**Do not** just open the app url with playwright-cli, always go through the test to capture any custom setup done there.

Walk the scenario's `Steps:` one by one with `playwright-cli`, treating the spec as the plan and the live app as the source of truth. If a step is vague ("click the button" — which button?), references an element that no longer exists, or contradicts the app's actual behaviour, use your judgement: update the spec to match what the app really does, then keep going. Editing the spec mid-generation is expected.

Every action prints the equivalent Playwright TypeScript (see [How generation works](#0-how-generation-works)):

```bash
playwright-cli snapshot                         # find refs
playwright-cli fill e3 "John Doe"               # -> page.getByRole('textbox', {...}).fill(...)
playwright-cli press Enter
playwright-cli click e7
```

For each `- expect:` bullet, add an explicit assertion. See [How generation works](#0-how-generation-works) for details.

Collect the generated code and write it into the test file at the path given in the spec's group — if the file
already has a `test.describe()` for this group from a prior scenario, add this scenario as a new `test()` inside
that same block rather than starting a new file or a duplicate `describe()`:

```ts
// spec: specs/basic-operations.plan.md
// seed: tests/seed.spec.ts
import { test, expect } from './fixtures';   // or '@playwright/test' if no fixtures file

test.describe('Signing in and out', () => {
  test('should sign in', async ({ page }) => {
    // 1. Navigate to the application
    // (handled by the seed fixture)

    // 2. Type 'John Doe' into the username field
    await page.getByRole('textbox', { name: 'username' }).fill('John Doe');

    // 3. Type password
    await page.getByRole('textbox', { name: 'password' }).fill('TestPassword');

    // 4. Press Enter to submit
    await page.getByRole('textbox', { name: 'password' }).press('Enter');

    await expect(page.getByRole('heading')).toContainText('Welcome, John Doe!');
  });
});
```

Rules:

- **One test per file.** File path, describe name, and test name come verbatim from the spec (minus the ordinal).
- Prefix each numbered step with a `// N. <step text>` comment before its actions.
- Use the describe group name verbatim from the spec (no `1.` ordinal).
- Import from `./fixtures` if the project has one; otherwise `@playwright/test`.
- **Important**: close the CLI session and stop the background test before moving to the next scenario.

### 2.2.1 Assertion quality (do not skip this)

- Every assertion must be capable of catching a real regression. Before writing one, ask: "if the feature broke,
  would this actually fail?" Reject assertions that pass regardless of behavior, such as `not.toBe('')`,
  `toBeGreaterThanOrEqual(0)` on a value that's always non-negative, or checking mere existence when the scenario
  is about state or content.
- Where the expected value can be derived from data already on the page (totals, counts, sorted order, computed
  fields), derive it programmatically rather than hardcoding an observed snapshot value. A hardcoded expected
  value only proves the page matches today's snapshot, not that the underlying logic is correct.
- Prefer specific, state-verifying assertions (`toHaveText`, `toBeChecked`, `toHaveValue`, `toHaveAttribute`) over
  vague presence checks, whenever the scenario is about a specific state or value rather than mere existence.
- One file per test **suite**, not per scenario: all scenarios belonging to the same top-level plan group share one
  `test.describe()` block in one file, as separate `test()` entries — don't fragment a suite across files or repeat
  the same `describe()` wrapper in several files.

### 2.3 Generate multiple scenarios

Loop 2.2 over the targeted scenarios one at a time, restarting the seed between each so every test starts from a clean page. This is safe to parallelise due to unique generated session names - just make sure each test run is stopped.

### 2.4 Run generated tests

After generation, run the new tests once:

```bash
PLAYWRIGHT_HTML_OPEN=never npx playwright test tests/<group>/<scenario>.spec.ts
```

Any failure goes to Section 3.

---

## 3. Heal

Goal: fix failing tests, and update the spec if the app's intended behaviour changed.

### 3.1 Find failing tests

```bash
PLAYWRIGHT_HTML_OPEN=never npx playwright test
```

Record the list of failing `<file>:<line>` entries and process them one at a time. Do not attempt parallel fixes — shared state and the single CLI session make that fragile.

### 3.2 Debug one failure

Run the single failing test in debug mode in the background, then attach:

```bash
PLAYWRIGHT_HTML_OPEN=never npx playwright test tests/<group>/<scenario>.spec.ts:<line> --debug=cli
# wait for "Debugging Instructions" and the tw-XXXX session name
playwright-cli attach tw-XXXX
```

The test is paused at the start. Step forward or run to until just before the failing action or assertion, then diagnose:

```bash
playwright-cli snapshot                # did the element change / move / rename?
playwright-cli console                 # app-side errors?
playwright-cli requests                # failed request? wrong payload?
playwright-cli show --annotate         # ask the user to point somewhere
```

Common causes: selector drift, new wrapper element, label/ARIA rename, timing (transition, async load), assertion text updated in the app, test data leaking between runs.

Rehearse the corrected interaction with `playwright-cli` — the generated code in the output is what you paste back into the test.

### 3.2.1 Classify before fixing (do not skip this)

Every failure is one of two kinds, and they require opposite responses:

- **Test bug** — the test's selector, timing, or setup is wrong, but the app itself behaves correctly. → Fix the test.
- **Real regression** — the app's actual behavior changed or is wrong (bad computed value, broken interaction,
  changed/missing element, content that doesn't match what the feature is supposed to do), and the test correctly
  caught it. → Do **not** edit the test to match the broken behavior. Leave the assertion as-is, mark the test
  `test.fixme()`, and add a comment stating what you observed instead of the expected behavior so a human can
  triage it as a product bug.

Never weaken an assertion just to make it pass (turning an exact/computed expected value into a looser check like
`toBeGreaterThan(0)`, `not.toBe('')`, or a broader regex) unless you've confirmed the looser check is what the
scenario actually intends to verify. A fix that only stops the failure, without confirming the app still does what
the plan describes, is coverage loss disguised as a pass — that regression will never be caught again.

If unsure which kind it is, treat it as a possible regression: apply `test.fixme()` with a clear comment rather
than guessing at a fix.

### 3.3 Apply the fix

For confirmed test bugs, edit the test file: update the locator, assertion, step order, or inputs to match the
corrected behaviour. Stop the background debug run. Rerun the single test to confirm green.

Never skip hooks or add sleeps as a fix. Never use `networkidle`.

Cap yourself at 5 fix attempts per test. If it still fails after 5 attempts, stop, apply `test.fixme()` with a
comment summarizing what was tried and what remains unresolved, and move to the next failing test rather than
looping indefinitely.

### 3.4 Reconcile with the spec

Open the spec referenced by the `// spec:` header in the test file and locate the scenario that matches the test.

- **Fix was purely technical** (locator drift, better assertion shape) and the spec's user-level behaviour still matches the app → leave the spec alone.
- **Fix changed user-visible steps, inputs, order, or expected outcomes** that the spec describes → update the spec to match reality. Keep the scenario id and file path stable; only the step / expect lines change.
- **Unclear whether the app change is intentional** (spec is stale) **or a regression** (test was right, app is wrong) → **stop and ask the user**. Provide:
  - the scenario id (e.g. `2.3`),
  - the spec lines that no longer match,
  - the observed app behaviour (quote a snapshot excerpt or a concrete outcome).

Only after the user answers, either update the spec (intentional change) or file/flag the test as covering a bug (regression).

### 3.5 Iteration and giving up

- Fix failures one at a time; rerun after each.
- If after thorough investigation you are confident the test is correct but the app is wrong *and* the user has confirmed it's a bug: mark the test `test.fixme(...)` with a comment pointing at the user's decision or issue link. Never silently skip.

### 3.6 End-of-run summary (required)

After processing all failing tests, produce a short summary listing, for each test touched:

- Whether it was classified as a test bug (fixed) or a possible regression (`test.fixme()`)
- One line on the root cause
- The file and line changed, if any

This is what a human reviewer reads before merging — it must be enough for them to decide whether to trust each
fix without re-debugging it themselves.

---

## Cross-references

| For... | See |
|---|---|
| `--debug=cli` / attach mechanics | [playwright-tests.md](playwright-tests.md) |
| Mocking requests during exploration/generation | [request-mocking.md](request-mocking.md) |
| Managing the CLI browser session | [session-management.md](session-management.md) |
