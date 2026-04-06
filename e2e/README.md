# E2E Setup

This directory contains a minimal Playwright setup for end-to-end tests.

## Install

```bash
cd e2e
npm install
npx playwright install chromium
```

## Run

```bash
cd e2e
npm test
```

To run only the smoke test:

```bash
cd e2e
npm run test:smoke
```

The initial smoke test is self-contained and does not require any Saito services to be running.