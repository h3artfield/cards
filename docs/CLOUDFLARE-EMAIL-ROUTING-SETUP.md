# Cloudflare Email Routing — cardscanner9000.com

## Current DNS audit (2026-07-07)

| Record | Name | Value | Purpose |
|--------|------|-------|---------|
| TXT | `send.cardscanner9000.com` | `v=spf1 include:amazonses.com ~all` | **Resend outbound SPF** (subdomain) |
| TXT | `resend._domainkey.cardscanner9000.com` | Resend DKIM public key | **Resend DKIM** |
| TXT | `_dmarc.cardscanner9000.com` | `v=DMARC1; p=none;` | **DMARC** |
| MX | `cardscanner9000.com` | *(none)* | Email Routing **not enabled yet** |
| TXT | `cardscanner9000.com` (apex) | *(no SPF)* | Safe to add Cloudflare routing SPF |

**Resend is unaffected by inbound routing** — it uses the `send.` subdomain for SPF and a separate DKIM name. Cloudflare Email Routing adds **MX + apex SPF** for receiving only.

---

## Manual setup (Cloudflare Dashboard)

### 1. Enable Email Routing

1. Log in to [Cloudflare Dashboard](https://dash.cloudflare.com)
2. Select **cardscanner9000.com**
3. Go to **Email** → **Email Routing**
4. Click **Enable Email Routing**
5. Cloudflare will propose DNS records — **approve only these for the apex `@`**:

| Type | Name | Content | Priority | Notes |
|------|------|---------|----------|-------|
| MX | `@` | `route1.mx.cloudflare.net` | 73 | Inbound only |
| MX | `@` | `route2.mx.cloudflare.net` | 41 | Inbound only |
| MX | `@` | `route3.mx.cloudflare.net` | 12 | Inbound only |
| TXT | `@` | `v=spf1 include:_spf.mx.cloudflare.net ~all` | — | **Only if apex has no existing SPF** |

**Do not delete or edit:**

- `send` TXT (Resend SPF)
- `resend._domainkey` TXT (Resend DKIM)
- `_dmarc` TXT

If Cloudflare tries to **replace** an existing apex SPF that includes `amazonses.com`, stop and use a **merged** record instead:

```txt
v=spf1 include:_spf.mx.cloudflare.net include:amazonses.com ~all
```

(Currently there is **no apex SPF**, so the default Cloudflare record is fine.)

### 2. Add destination address

1. **Email Routing** → **Destination addresses**
2. Add `h3artfield@gmail.com`
3. Click the **verification link** Gmail sends

### 3. Create custom addresses

**Email Routing** → **Routing rules**:

| Custom address | Forwards to |
|----------------|-------------|
| `billing@cardscanner9000.com` | `h3artfield@gmail.com` |
| `admin@cardscanner9000.com` | `h3artfield@gmail.com` |
| `support@cardscanner9000.com` | `h3artfield@gmail.com` |

### 4. Stripe

Use **billing@cardscanner9000.com** as the Stripe account contact / receipt email.

---

## Test plan (after enablement)

1. From an external mailbox, send to `billing@cardscanner9000.com` — confirm at `h3artfield@gmail.com`
2. Repeat for `admin@` and `support@`
3. Confirm Resend still sends from `reports@cardscanner9000.com`

## Status (2026-07-07)

- **Email Routing:** Enabled (DNS locked by Cloudflare)
- **MX:** `route1/2/3.mx.cloudflare.net` on apex
- **Apex SPF:** `v=spf1 include:_spf.mx.cloudflare.net ~all`
- **Resend:** `send.*`, `resend._domainkey`, `_dmarc` unchanged
- **Forwarding:** billing@, admin@, support@ → h3artfield@gmail.com (user confirmed tests passed)
- **Stripe:** See `docs/STRIPE-SETUP.md` — use **billing@cardscanner9000.com** as Stripe account email
