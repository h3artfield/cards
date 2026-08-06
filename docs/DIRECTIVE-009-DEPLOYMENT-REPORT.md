# Directive 009 — CardScanner9000.com Public Website Deployment Report

## Deploy status

| Field | Value |
|-------|-------|
| **Cloud Build ID** | `33a17c2f-4fcf-49c1-bc92-d7913f306ac2` |
| **Web revision** | `buyback-web-staging-00158-p4p` |
| **Public URL (staging)** | https://buyback-web-staging-rrogeqxyea-uc.a.run.app |
| **Production domain (pending DNS)** | https://cardscanner9000.com |

## Public page URLs

| Page | Path |
|------|------|
| Home | `/` |
| Pricing | `/pricing` |
| Signup | `/signup` |
| Store login | `/login` |
| Checkout start | `/checkout` |
| Billing / portal | `/billing` |
| Store dashboard | `/admin` |
| Customer store directory | `/stores` |

Full staging URLs: prefix with `https://buyback-web-staging-rrogeqxyea-uc.a.run.app`.

Legacy `/store/login` → redirects to `/login`.

## What shipped

- Marketing homepage (hero, problem, solution, time savings, features, how it works, pricing, CTA)
- Store signup form → Firestore store + admin user → Stripe Checkout ($100/mo)
- Stripe webhook handler (`/api/stripe/webhook`)
- Billing portal (`/api/billing/portal`)
- Subscription gating for new store accounts (legacy stores without `subscription` field remain active)
- Admin dashboard link: **Manage subscription**

V2 processing, pricing rules, and staging order flows were not modified.

## Stripe configuration (required before live checkout)

Create in Stripe Dashboard:

1. **Product:** Card Scanner 9000 Store Plan
2. **Price:** $100/month recurring
3. Set env / Secret Manager:
   - `STRIPE_SECRET_KEY` (secret)
   - `STRIPE_WEBHOOK_SECRET` (secret)
   - `STRIPE_PRICE_ID_CARD_SCANNER_STORE_MONTHLY` (env var)

**Webhook endpoint:** `https://<host>/api/stripe/webhook`

Events: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`

### Test checkout

1. `/signup` → complete form → Stripe Checkout
2. Test card: `4242 4242 4242 4242`
3. Success URL: `/checkout/success` → dashboard

### Webhook test (local)

```bash
stripe listen --forward-to localhost:3000/api/stripe/webhook
stripe trigger checkout.session.completed
```

Verify config:

```bash
cd web && npx tsx scripts/test-directive-009-stripe-config.ts
```

**Note:** Stripe secrets were added to the deploy script mount list. Create enabled versions in GCP Secret Manager before checkout works on staging.

## Resend email DNS

No email DNS records were changed. Existing SPF, DKIM, DMARC, and Resend verification for `cardscanner9000.com` must remain untouched.

## Cloudflare DNS (review before applying)

Add web routing **without removing** Resend records:

1. In GCP: `gcloud run domain-mappings create --service buyback-web-staging --domain cardscanner9000.com --region us-central1 --project trading-card-buyback-dev`
2. Add the DNS records GCP provides (typically A/AAAA or CNAME for domain mapping)
3. Keep all existing Resend/MX/SPF/DKIM/DMARC rows as-is

Optional: `app.cardscanner9000.com` CNAME to the same Cloud Run mapping.

## Build

`npm run build` — passes (63 routes).
