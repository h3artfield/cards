# DEPRECATED — use scripts/deploy-web-staging-cloudbuild.ps1 (canonical staging deploy).
# Local Docker rebuild hung for ~24h on "Rebuild with APP_URL"; Cloud Build is reliable.
$ErrorActionPreference = "Stop"
Write-Host "ERROR: deploy-web-staging-only.ps1 is deprecated." -ForegroundColor Red
Write-Host "Use: powershell -ExecutionPolicy Bypass -File scripts\deploy-web-staging-cloudbuild.ps1" -ForegroundColor Yellow
exit 1

# --- legacy script below (not executed) ---
$PROJECT_ID = "trading-card-buyback-dev"
$REGION = "us-central1"
$WEB_SERVICE = "buyback-web-staging"
$REGISTRY = "us-central1-docker.pkg.dev/trading-card-buyback-dev/buyback"
$GRADING_URL = "https://grading-service-staging-rrogeqxyea-uc.a.run.app"
$ENV_FILE = Join-Path $PSScriptRoot "..\web\.env.local"

function Get-SecretMountList() {
  $mounts = @()
  foreach ($name in @("OPENAI_API_KEY", "ADMIN_SESSION_SECRET", "POKEMON_TCG_API_KEY", "PRICECHARTING_API_KEY", "EBAY_CLIENT_ID", "EBAY_CLIENT_SECRET")) {
    $prevEap = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    $enabled = gcloud secrets versions list $name --project=$PROJECT_ID --filter="state=ENABLED" --format="value(name)" 2>$null
    $ErrorActionPreference = $prevEap
    if ($LASTEXITCODE -eq 0 -and $enabled) {
      $mounts += "${name}=${name}:latest"
    } else {
      Write-Host "  skip $name (no enabled version)"
    }
  }
  return ($mounts -join ",")
}

$SECRET_MOUNT = Get-SecretMountList
if (-not $SECRET_MOUNT) { throw "No secrets with enabled versions to mount" }
Write-Host "Mounting secrets: $SECRET_MOUNT"

function Get-EnvValue([string]$Name) {
  foreach ($line in Get-Content $ENV_FILE) {
    if ($line -match "^$Name=(.*)$") { return $Matches[1].Trim() }
  }
  return ""
}

$fbProjectId = Get-EnvValue "NEXT_PUBLIC_FIREBASE_PROJECT_ID"
$fbBucket = Get-EnvValue "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET"
$fbApiKey = Get-EnvValue "NEXT_PUBLIC_FIREBASE_API_KEY"
$fbAuthDomain = Get-EnvValue "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN"
$fbSender = Get-EnvValue "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID"
$fbAppId = Get-EnvValue "NEXT_PUBLIC_FIREBASE_APP_ID"

function Write-EnvYaml([string]$Path, [string]$AppUrl) {
  @"
FIREBASE_PROJECT_ID: "$fbProjectId"
NEXT_PUBLIC_FIREBASE_PROJECT_ID: "$fbProjectId"
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: "$fbBucket"
GRADING_SERVICE_URL: "$GRADING_URL"
REQUIRE_FIRESTORE: "true"
APP_URL: "$AppUrl"
NEXT_PUBLIC_APP_URL: "$AppUrl"
CARD_FLOW_V2_EVIDENCE_ENABLED: "true"
CARD_FLOW_V2_IDENTITY_ENABLED: "true"
CARD_FLOW_V2_MARKET_ENABLED: "true"
CARD_FLOW_V2_AUDIT_ENABLED: "true"
CARD_FLOW_V2_STAFF_CONFIRMATION_ENABLED: "true"
CARD_FLOW_V2_OFFER_PREVIEW_ENABLED: "true"
CARD_FLOW_V2_MARKET_MAX_SUSPECTS: "3"
CARD_FLOW_V2_MARKET_ENABLE_EBAY: "true"
CARD_FLOW_V2_MARKET_ENABLE_PRICECHARTING: "true"
CARD_FLOW_V2_MARKET_ENABLE_TCGPLAYER: "true"
"@ | Set-Content -Path $Path -Encoding utf8
}

$envPath = Join-Path $env:TEMP "buyback-web-staging-env.yaml"
Write-EnvYaml $envPath "https://placeholder.run.app"

Write-Host "==> Deploy buyback-web-staging (initial)"
gcloud run deploy $WEB_SERVICE `
  --image="${REGISTRY}/buyback-web-staging:latest" `
  --region=$REGION `
  --project=$PROJECT_ID `
  --allow-unauthenticated `
  --port=8080 `
  --memory=1Gi `
  --cpu=1 `
  --timeout=300 `
  --set-secrets=$SECRET_MOUNT `
  --env-vars-file=$envPath `
  --quiet

$WEB_URL = gcloud run services describe $WEB_SERVICE --region=$REGION --project=$PROJECT_ID --format="value(status.url)"
Write-Host "Web URL: $WEB_URL"

Write-Host "==> Rebuild with APP_URL"
Push-Location (Join-Path $PSScriptRoot "..\web")
docker build `
  --build-arg NEXT_PUBLIC_FIREBASE_API_KEY=$fbApiKey `
  --build-arg NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=$fbAuthDomain `
  --build-arg NEXT_PUBLIC_FIREBASE_PROJECT_ID=$fbProjectId `
  --build-arg NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=$fbBucket `
  --build-arg NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=$fbSender `
  --build-arg NEXT_PUBLIC_FIREBASE_APP_ID=$fbAppId `
  --build-arg NEXT_PUBLIC_APP_URL=$WEB_URL `
  -t "${REGISTRY}/buyback-web-staging:latest" .
docker push "${REGISTRY}/buyback-web-staging:latest"
Pop-Location

Write-EnvYaml $envPath $WEB_URL
Write-Host "==> Redeploy with final APP_URL"
gcloud run deploy $WEB_SERVICE `
  --image="${REGISTRY}/buyback-web-staging:latest" `
  --region=$REGION `
  --project=$PROJECT_ID `
  --allow-unauthenticated `
  --port=8080 `
  --memory=1Gi `
  --cpu=1 `
  --timeout=300 `
  --set-secrets=$SECRET_MOUNT `
  --env-vars-file=$envPath `
  --quiet

Write-Host "DONE Web: $WEB_URL"
