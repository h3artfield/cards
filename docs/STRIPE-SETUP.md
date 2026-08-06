# Stripe setup — Card Scanner 9000 Store Plan

## Platform billing email

Use **`billing@cardscanner9000.com`** for:

- Stripe account email (Settings → Business details)
- Stripe receipt / invoice notifications you want at the platform level
- Payment-related correspondence

Forwards to `h3artfield@gmail.com` via Cloudflare Email Routing (verified).

Store owners still use their own email at signup/checkout; platform Stripe account contact is `billing@`.

---

## 1. Stripe Dashboard (one-time)

1. [Stripe Dashboard](https://dashboard.stripe.com) → **Settings** → **Business** → set account email to **`billing@cardscanner9000.com`**
2. **Settings** → **Billing** → **Customer portal** → Enable (cancel, update payment method, view invoices)
3. Use **Test mode** until production launch

---

## 2. Create product + price (script)

Add to `web/.env.local`:

```env
STRIPE_SECRET_KEY=sk_test_...
```

Run:

```bash
cd web
npx tsx scripts/setup-stripe-store-plan.ts
```

Add the printed line to `.env.local`:

```env
STRIPE_PRICE_ID_CARD_SCANNER_STORE_MONTHLY=price_...
```

---

## 3. Webhook

**Staging endpoint:**

```
https://buyback-web-staging-rrogeqxyea-uc.a.run.app/api/stripe/webhook
```

Stripe Dashboard → **Developers** → **Webhooks** → Add endpoint:

| Event |
|-------|
| `checkout.session.completed` |
| `customer.subscription.created` |
| `customer.subscription.updated` |
| `customer.subscription.deleted` |
| `invoice.payment_failed` |

Copy **Signing secret** → `web/.env.local`:

```env
STRIPE_WEBHOOK_SECRET=whsec_...
```

---

## 4. Sync to GCP + deploy

```powershell
powershell -ExecutionPolicy Bypass -File scripts/sync-stripe-secrets.ps1
powershell -ExecutionPolicy Bypass -File scripts/deploy-web-staging-cloudbuild.ps1
```

---

## 5. Test checkout

1. Open https://buyback-web-staging-rrogeqxyea-uc.a.run.app/signup
2. Complete form → Stripe Checkout
3. Card: `4242 4242 4242 4242`
4. Success → `/checkout/success` → `/admin`
5. Confirm webhook fired (Stripe Dashboard → Webhooks → event log)
6. Confirm `billing@` receives any Stripe platform emails you trigger

---

## DNS (no changes needed)

Email Routing is enabled. Resend records remain on separate names:

- `send.cardscanner9000.com` — Resend SPF
- `resend._domainkey.cardscanner9000.com` — Resend DKIM
- `_dmarc.cardscanner9000.com` — DMARC

Do not unlock Cloudflare Email Routing DNS unless Stripe/Resend support requires it.
