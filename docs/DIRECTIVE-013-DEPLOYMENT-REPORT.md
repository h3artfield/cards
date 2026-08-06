# Directive 013 — Customer Accounts Deployment Report

**Date:** 2026-07-08  
**Revision:** `buyback-web-staging-00170-tsx`  
**URL:** https://buyback-web-staging-rrogeqxyea-uc.a.run.app  
**Phase:** 1 (email + guest + verification; Google disabled pending OAuth creds)

## Deploy summary

Secrets synced via `scripts/sync-customer-auth-secrets.ps1`:

| Secret / env | Status |
|--------------|--------|
| `CUSTOMER_SESSION_SECRET` | Created in Secret Manager (value in `web/.env.local`, not committed) |
| `CUSTOMER_EMAIL_VERIFICATION_ENABLED` | `true` |
| `CUSTOMER_GUEST_MODE_ENABLED` | `true` |
| `AUTH_APPLE_ENABLED` | `false` |
| `AUTH_GOOGLE_ENABLED` | `false` (no Google OAuth creds in Secret Manager yet) |

Deploy: `scripts/deploy-web-staging-cloudbuild.ps1` — **SUCCESS**

## Staging checklist results (automated)

```
scripts/smoke-test-directive-013-staging.ps1
17 passed, 0 failed
```

| # | Test | Result |
|---|------|--------|
| 1 | `/s/the-game-lodge` loads | PASS |
| 2 | Guest mode enabled on store API | PASS |
| 3 | Apple hidden (`appleEnabled=false`) | PASS |
| 4 | Google disabled on store API (Phase 1) | PASS |
| 5 | Email signup + verification send | PASS |
| 6 | `customer_session` cookie set | PASS |
| 7 | Unverified blocked from order history (403) | PASS |
| 8 | Unverified can create draft order | PASS (BB-000007) |
| 9 | Guest checkout + order | PASS |
| 10 | Unauthenticated order GET blocked | PASS |
| 11 | Admin orders API requires admin session | PASS |
| 12 | Store admin login (`lodge1@gmail.com`) | PASS |
| 13 | Store staff can list orders | PASS |
| 14 | Forgot password neutral message | PASS |
| 15 | Google OAuth 404 when disabled | PASS |

## Manual follow-ups

- Click verification email link for a real inbox address
- Stripe `/signup` checkout regression (unchanged code path)
- Ready-for-review email after order processing (006W, unchanged)

## Enable Google (Phase 2)

1. Add to `web/.env.local`: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
2. Run `scripts/sync-customer-auth-secrets.ps1`
3. Register callback URLs in Google Cloud Console:
   - `https://cardscanner9000.com/api/auth/google/callback`
   - `https://buyback-web-staging-rrogeqxyea-uc.a.run.app/api/auth/google/callback`
4. Redeploy — script auto-sets `AUTH_GOOGLE_ENABLED=true` when both secrets exist

## Unchanged (verified)

- Store admin login and `/api/admin/orders` (general smoke test 7/7)
- V2 pricing / processing env flags unchanged
- Shopify export logic unchanged

## Key files

| Area | Path |
|------|------|
| Secret sync | `scripts/sync-customer-auth-secrets.ps1` |
| Deploy | `scripts/deploy-web-staging-cloudbuild.ps1` |
| Staging checklist | `scripts/smoke-test-directive-013-staging.ps1` |
| Unit tests | `web/scripts/test-directive-013-customer-auth.ts` |
