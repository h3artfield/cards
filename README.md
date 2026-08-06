# Trading Card Buyback Scanner V1

Web-based buyback scanner where customers use their phone camera to submit raw cards and graded slabs for store review and offers.

## Stack

- **Frontend**: Next.js 16 (App Router), TypeScript, Tailwind CSS
- **Backend**: Next.js API routes (local dev) with optional Firebase Firestore + Storage
- **Vision**: OpenAI GPT-4o (required — reads card name, set, collector number from photos)
- **Pricing**: Pokémon TCG API, Scryfall (MTG), YGOProDeck (Yu-Gi-Oh!), sports estimates
- **Email**: Resend (optional — logs to console without key)

## Quick start

```bash
cd web
cp .env.example .env.local
npm install
npm run dev
```

Open http://localhost:3000 on your desktop.

### Test on your phone (same Wi‑Fi)

`localhost` on your phone means the phone itself — use your PC’s LAN IP instead.

1. Start the dev server: `npm run dev`
2. Find your PC IP (Windows PowerShell): `ipconfig` → look for **Wi‑Fi** → IPv4 (e.g. `192.168.1.125`)
3. On your phone’s browser, open: `http://192.168.1.125:3000` (replace with your IP)
4. Phone and PC must be on the **same Wi‑Fi** (not guest network / cellular)
5. If pages stay on “Loading form…” or buttons don’t work, **restart the dev server** after changing `next.config.ts` — Next.js blocks `/_next/*` JS from LAN IPs unless `allowedDevOrigins` includes your PC’s IP
6. If it still fails, allow Node.js through **Windows Firewall** for private networks

#### Camera on phone (HTTPS required for live preview)

Browsers **block live camera preview** when you open the app at `http://192.168.x.x` — only `https://` (or desktop `localhost`) is allowed.

**Option A — Upload photos (works on HTTP now):** On the scan page, tap **Upload Front Image** / **Upload Back Image**. That opens your phone camera without needing HTTPS.

**Option B — Live preview with overlay (HTTPS):** In a second terminal while `npm run dev` is running:

```bash
cd web
npm run dev:tunnel
```

Open the `https://….trycloudflare.com` URL it prints on your phone. Live camera + alignment overlay will work.

The dev server binds to `0.0.0.0` so other devices on your network can reach it. For production phone use, deploy to Firebase Hosting (HTTPS).

### Admin dashboard

1. Go to `/admin/login`
2. Enter the `ADMIN_SECRET` from `.env.local` (leave unset in dev for open access)
3. Manage orders, rules, percentages, and settings

## Customer flow

1. **Landing** — Store name + “Start Buyback Order”
2. **Sign in** — First name, last name, email, phone
3. **Scan** — Choose raw / graded / not sure → capture front & back with camera overlay
4. **Submit** — Consent checkbox → upload → AI identification → pricing → rules
5. **Order page** — Order number, status, card thumbnails, offers when ready

## Environment variables

See `web/.env.example`. Key variables:

| Variable | Purpose |
|----------|---------|
| `OPENAI_API_KEY` | **Required** — card identification from photos (`OPENAI_VISION_MODEL=gpt-4o`) |
| `ADMIN_SECRET` | Protects admin API routes |
| `RESEND_API_KEY` | Customer/owner email notifications |
| `NEXT_PUBLIC_FIREBASE_*` | Firebase client (optional) |
| `FIREBASE_SERVICE_ACCOUNT_KEY` | Server Firestore/Storage (optional) |
| `POKEMON_TCG_API_KEY` | **Recommended** — live Pokémon pricing ([free key](https://dev.pokemontcg.io)) |
| `GRADING_SERVICE_URL` | OpenCV subgrade service (default `http://localhost:8001`) |
| `PRICECHARTING_API_KEY` | Optional — extra price comp tiers |

Without Firebase configured, the app uses an in-memory store (resets on server restart) — fine for local demos.

## Full card analysis (admin)

On an order detail page, **Run full analysis** runs this pipeline per card:

1. **Refresh pricing** — Pokémon TCG API (or Scryfall/YGOProDeck) for live tiers
2. **Identity verify** — GPT compares customer photo to official catalog art from the pricing match
3. **Condition pre-grade** — OpenCV service (`services/grading-service`) for centering, corners, edges, surface
4. **Price comps** — TCGPlayer tiers (or PriceCharting when key is set)
5. **Buyback report** — GPT reseller analysis using all of the above

Start the grading service (second terminal):

```bash
cd web
npm run grading
# or: docker compose up grading-service
```

Health check: `curl http://localhost:8001/health`

## Firebase setup (`trading-card-buyback-dev`)

Your client config is in `web/.env.local`. The app already reads it via env vars — **do not** hardcode the config in source files.

### 1. Enable Firebase products (Console)

In [Firebase Console](https://console.firebase.google.com/project/trading-card-buyback-dev):

1. **Firestore** → Create database → Start in **test mode** for dev (or production mode + deploy rules below)
2. **Storage** → Get started → same region as Firestore
3. *(Optional V2)* **Authentication** — not required for V1

### 2. Service account (required for persistent data)

API routes use **Firebase Admin** to read/write Firestore. Client config alone is not enough.

1. Firebase Console → **Project settings** → **Service accounts**
2. Click **Generate new private key** → download JSON
3. In `web/.env.local`, set `FIREBASE_SERVICE_ACCOUNT_KEY` to the **entire JSON on one line**, e.g.:

```env
FIREBASE_SERVICE_ACCOUNT_KEY={"type":"service_account","project_id":"trading-card-buyback-dev",...}
```

Or save the file outside the repo and set:

```env
GOOGLE_APPLICATION_CREDENTIALS=C:\path\to\service-account.json
```

Restart `npm run dev` after updating env vars.

### 3. Deploy security rules

From the repo root (with [Firebase CLI](https://firebase.google.com/docs/cli) installed):

```bash
firebase login
firebase deploy --only firestore:rules,storage
```

### 4. Verify Firestore is active

After adding the service account key, create a test order in the app. You should see documents appear under Firestore collections:

| Collection | Created by |
|------------|------------|
| `storeSettings/default` | You (owner) — percentages, multipliers, notifications |
| `storeRules` | You (owner) — buy policy rules |
| `customers` | App — when customer signs up |
| `orders` | App — when customer starts a buyback |
| `cards` | App — when customer scans front/back |

Without the service account key, the app still runs but uses **in-memory storage** (data lost on server restart).

## V1 success criteria

All 17 criteria from the build plan are implemented:

- Customer mobile scan flow (raw + graded)
- Multi-card orders with order numbers (`BB-000001`)
- OpenAI vision processing with store rules in prompt + deterministic re-apply
- Category-specific pricing + condition price ladder
- Admin review with edit/approve/reject/do-not-buy
- Customer order status + email on offer ready (when Resend configured)

## Project structure

```
cards/
├── web/                    # Next.js app
│   ├── src/app/            # Pages + API routes
│   ├── src/components/     # Camera, admin UI
│   └── src/lib/            # Types, processing, storage
├── firebase.json
├── firestore.rules
└── storage.rules
```

## QR code

Point your store QR code to your deployed URL (e.g. `https://your-store.web.app`). Customers land on the home page and tap **Start Buyback Order**.
