# Cloud Run staging deployment

Deploy to `trading-card-buyback-dev` without creating a production project yet.

## Prerequisites

1. **Google Cloud CLI** authenticated:
   ```powershell
   gcloud auth login
   gcloud auth application-default login
   gcloud config set project trading-card-buyback-dev
   ```
2. **Docker Desktop** running.
3. **`web/.env.local`** populated (used only to seed Secret Manager — not baked into images).

## One-command deploy

From repo root:

```powershell
.\scripts\deploy-cloud-run-staging.ps1
```

This script:

- Creates/updates Secret Manager secrets
- Builds and pushes both Docker images to Artifact Registry
- Deploys `grading-service-staging` then `buyback-web-staging`
- Sets `GRADING_SERVICE_URL`, `APP_URL`, and `NEXT_PUBLIC_APP_URL`
- Grants Cloud Run service account IAM for secrets, Firestore, and Storage
- Deploys Firestore + Storage rules via `npx firebase-tools`

## Smoke test

After deploy:

```powershell
.\scripts\smoke-test-staging.ps1 -BaseUrl "https://buyback-web-staging-XXXX.run.app"
```

## Manual local Docker build (optional)

```powershell
.\scripts\build-web-docker.ps1 -AppUrl "https://your-url.run.app"
docker build -t grading-service-staging:local services/grading-service
```

## Cloud-only Firestore requirement

The web Dockerfile sets `REQUIRE_FIRESTORE=true`. In cloud mode:

- Startup fails if Firebase Admin cannot initialize
- API routes throw instead of using in-memory storage
- `/api/health/firestore` returns 503 if Firestore is unavailable

## Secrets in Secret Manager

| Secret | Required |
|--------|----------|
| `OPENAI_API_KEY` | Yes (AI pipeline) |
| `ADMIN_SESSION_SECRET` | Yes |
| `POKEMON_TCG_API_KEY` | Recommended |
| `PRICECHARTING_API_KEY` | Optional (eBay-derived price fallback) |
| `FIREBASE_SERVICE_ACCOUNT_KEY` | Yes (unless using ADC-only IAM) |
| `RESEND_API_KEY` | Optional |

Mounting is via Cloud Run `--set-secrets`; nothing is copied into the Docker image.
