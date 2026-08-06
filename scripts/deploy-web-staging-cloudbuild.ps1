# Deploy buyback-web-staging via Cloud Build (canonical staging deploy path).
# Do NOT use deploy-web-staging-only.ps1 — local Docker rebuild can hang indefinitely.
$ErrorActionPreference = "Stop"
$PROJECT_ID = "trading-card-buyback-dev"
$REGION = "us-central1"
$WEB_SERVICE = "buyback-web-staging"
$GRADING_URL = "https://grading-service-staging-rrogeqxyea-uc.a.run.app"
$ENV_FILE = Join-Path $PSScriptRoot "..\web\.env.local"
$REPO_ROOT = Join-Path $PSScriptRoot ".."

function Get-EnvValue([string]$Name) {
  foreach ($line in Get-Content $ENV_FILE) {
    if ($line -match "^$Name=(.*)$") { return $Matches[1].Trim() }
  }
  return ""
}

function Test-SecretEnabled([string]$Name) {
  $prevEap = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  $enabled = gcloud secrets versions list $Name --project=$PROJECT_ID --filter="state=ENABLED" --format="value(name)" 2>$null
  $ErrorActionPreference = $prevEap
  return ($LASTEXITCODE -eq 0 -and $enabled)
}

function Get-SecretMountList() {
  $mounts = @()
  foreach ($name in @(
    "OPENAI_API_KEY", "ADMIN_SESSION_SECRET", "CUSTOMER_SESSION_SECRET",
    "POKEMON_TCG_API_KEY", "PRICECHARTING_API_KEY", "RESEND_API_KEY",
    "EBAY_CLIENT_ID", "EBAY_CLIENT_SECRET", "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET",
    "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"
  )) {
    if (Test-SecretEnabled $name) {
      $mounts += "${name}=${name}:latest"
    }
  }
  return ($mounts -join ",")
}

function Test-GoogleOAuthReady() {
  return (Test-SecretEnabled "GOOGLE_CLIENT_ID") -and (Test-SecretEnabled "GOOGLE_CLIENT_SECRET")
}

$WEB_URL = gcloud run services describe $WEB_SERVICE --region=$REGION --project=$PROJECT_ID --format="value(status.url)"
if (-not $WEB_URL) { throw "Could not resolve Cloud Run URL for $WEB_SERVICE" }
Write-Host "Web URL: $WEB_URL"

$subs = @(
  "_FB_API_KEY=$(Get-EnvValue 'NEXT_PUBLIC_FIREBASE_API_KEY')"
  "_FB_AUTH_DOMAIN=$(Get-EnvValue 'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN')"
  "_FB_PROJECT_ID=$(Get-EnvValue 'NEXT_PUBLIC_FIREBASE_PROJECT_ID')"
  "_FB_BUCKET=$(Get-EnvValue 'NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET')"
  "_FB_SENDER=$(Get-EnvValue 'NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID')"
  "_FB_APP_ID=$(Get-EnvValue 'NEXT_PUBLIC_FIREBASE_APP_ID')"
  "_APP_URL=$WEB_URL"
) -join ","

Write-Host "==> Cloud Build (buyback-web-staging)"
Push-Location $REPO_ROOT
gcloud builds submit . `
  --project=$PROJECT_ID `
  --config=scripts/cloudbuild-web-staging.yaml `
  --substitutions=$subs
Pop-Location

$SECRET_MOUNT = Get-SecretMountList
if (-not $SECRET_MOUNT) { throw "No secrets with enabled versions to mount" }

$googleOAuthReady = Test-GoogleOAuthReady
$authGoogleEnabled = if ($googleOAuthReady) { "true" } else { "false" }
Write-Host "AUTH_GOOGLE_ENABLED=$authGoogleEnabled (Google secrets in Secret Manager: $googleOAuthReady)"

$fbProjectId = Get-EnvValue "NEXT_PUBLIC_FIREBASE_PROJECT_ID"
$fbBucket = Get-EnvValue "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET"
$envPath = Join-Path $env:TEMP "buyback-web-staging-env.yaml"
$googleRedirectLine = ""
if ($googleOAuthReady) {
  $googleRedirectLine = "GOOGLE_REDIRECT_URI: `"https://cardscanner9000.com/api/auth/google/callback`""
}
$envContent = @"
FIREBASE_PROJECT_ID: "$fbProjectId"
NEXT_PUBLIC_FIREBASE_PROJECT_ID: "$fbProjectId"
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: "$fbBucket"
GRADING_SERVICE_URL: "$GRADING_URL"
REQUIRE_FIRESTORE: "true"
APP_URL: "$WEB_URL"
NEXT_PUBLIC_APP_URL: "$WEB_URL"
CUSTOMER_EMAIL_VERIFICATION_ENABLED: "true"
CUSTOMER_GUEST_MODE_ENABLED: "false"
AUTH_APPLE_ENABLED: "false"
AUTH_GOOGLE_ENABLED: "$authGoogleEnabled"
$googleRedirectLine
CARD_FLOW_V2_EVIDENCE_ENABLED: "true"
CARD_FLOW_V2_IDENTITY_ENABLED: "true"
CARD_FLOW_V2_MARKET_ENABLED: "true"
CARD_FLOW_V2_AUDIT_ENABLED: "true"
CARD_FLOW_V2_STAFF_CONFIRMATION_ENABLED: "true"
CARD_FLOW_V2_OFFER_PREVIEW_ENABLED: "true"
CARD_FLOW_V2_OFFER_INFLUENCE: "true"
CARD_FLOW_V2_MARKET_MAX_SUSPECTS: "1"
CARD_FLOW_V2_MARKET_ENABLE_EBAY: "true"
CARD_FLOW_V2_MARKET_ENABLE_PRICECHARTING: "true"
CARD_FLOW_V2_MARKET_ENABLE_TCGPLAYER: "true"
EMAIL_FROM: "Card Scanner Reports <reports@cardscanner9000.com>"
PRICECHARTING_IMPORT_EMAIL_PROVIDER: "resend"
PRICECHARTING_IMPORT_EMAIL_TO: "h3artfield@gmail.com"
PRICECHARTING_IMPORT_EMAIL_FROM: "reports@cardscanner9000.com"
PRICECHARTING_IMPORT_EMAIL_FROM_NAME: "Card Scanner Reports"
ORDER_READY_CUSTOMER_EMAIL_ENABLED: "true"
ORDER_READY_CUSTOMER_EMAIL_START_AT: "2026-07-05T00:00:00.000Z"
ORDER_READY_CUSTOMER_EMAIL_FROM: "reports@cardscanner9000.com"
ORDER_READY_CUSTOMER_EMAIL_FROM_NAME: "Card Scanner Reports"
ORDER_PROCESSING_WORKER: "cloud_run_job"
CARD_PROCESSING_PIPELINE_MODE: "v2_primary"
V1_FULL_ANALYSIS_ON_SUBMIT: "false"
V1_PRICING_ON_SUBMIT: "false"
V1_ANALYSIS_ASYNC_ENABLED: "false"
CARD_PROCESSING_CONCURRENCY: "2"
ORDER_PROCESSING_JOB_NAME: "order-processing-job"
CLOUD_RUN_REGION: "us-central1"
OPENAI_REQUEST_TIMEOUT_MS: "60000"
ORDER_PROCESSING_STUCK_THRESHOLD_MS: "600000"
STRIPE_PRICE_ID_CARD_SCANNER_STORE_MONTHLY: "$(Get-EnvValue 'STRIPE_PRICE_ID_CARD_SCANNER_STORE_MONTHLY')"
MTG_RAG_ENABLED: "true"
"@
$envContent | Set-Content -Path $envPath -Encoding utf8

Write-Host "==> Deploy buyback-web-staging"
gcloud run deploy $WEB_SERVICE `
  --image="us-central1-docker.pkg.dev/$PROJECT_ID/buyback/buyback-web-staging:latest" `
  --region=$REGION `
  --project=$PROJECT_ID `
  --allow-unauthenticated `
  --port=8080 `
  --memory=1Gi `
  --cpu=1 `
  --min-instances=1 `
  --timeout=300 `
  --set-secrets=$SECRET_MOUNT `
  --env-vars-file=$envPath `
  --quiet

Write-Host "DONE Web: $WEB_URL"
