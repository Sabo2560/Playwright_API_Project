# PlaywrightCLI API Test Automation

Playwright-based API test suite, targeting a locally hosted instance of
[restful-booker](https://github.com/mwinteringham/restful-booker) as the
API under test.

## Setup

### 1. Run the API under test

`restful-booker` is not part of this repo — clone and run it separately:

```bash
git clone https://github.com/mwinteringham/restful-booker.git
cd restful-booker
docker compose build
docker compose up
```

Verify it's live: `curl http://localhost:3001/ping` should return `201 Created`.

### 2. Install test dependencies

```bash
npm install
```

## Running the tests

```bash
npm test                     # run all tests
npx playwright test --ui     # interactive UI mode
npx playwright show-report   # view the last HTML report
```
