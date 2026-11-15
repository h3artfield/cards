# Customer UX audit pack

Playwright journeys against `https://cardscanner9000.com/s/the-game-lodge` from a logged-in customer session.

## Commands (from `web/`)

```bash
npm run e2e:ux:auth   # headed Google login → e2e/.auth/customer.json
npm run e2e:ux:mint   # mint session cookie via CUSTOMER_SESSION_SECRET (no Google UI)
npm run e2e:ux        # full desktop + mobile journeys
npm run e2e:ux:report # print ranked findings from artifacts/ux-findings.json
```

Force a fresh Google login:

```bash
set UX_FORCE_AUTH=1
npm run e2e:ux:auth
```

Mint without Google (needs gcloud secret access):

```bash
set CUSTOMER_SESSION_SECRET=<from Secret Manager>
npm run e2e:ux:mint
```

## Out of scope

Card scan / camera routes are never clicked.

## Artifacts

- `e2e/.auth/customer.json` — gitignored session
- `e2e/artifacts/ux-findings.json` — severity-ranked UX/design findings
- `e2e/artifacts/screens/` — evidence screenshots
