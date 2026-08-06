# Directive 008 — Cloud Run Job for V2-primary order processing
# Usage: .\scripts\deploy-order-processing-job.ps1
$ErrorActionPreference = "Stop"
$REPO_ROOT = Split-Path -Parent $PSScriptRoot
$PROJECT_ID = "trading-card-buyback-dev"
$REGION = "us-central1"
$JOB_NAME = "order-processing-job"
$IMAGE = "us-central1-docker.pkg.dev/$PROJECT_ID/buyback/order-processing-job:latest"
$WEB_SERVICE = "buyback-web-staging"

function Get-EnvValue([string]$Name) {
  $localPath = Join-Path $REPO_ROOT "web\.env.local"
  if (-not (Test-Path $localPath)) { return $null }
  foreach ($line in Get-Content $localPath) {
    $t = $line.Trim()
    if ($t -match "^$Name=(.+)$") { return $Matches[1].Trim() }
  }
  return $null
}

Write-Host "==> Cloud Build order-processing-job"
Push-Location $REPO_ROOT
try {
  gcloud builds submit . `
    --config=scripts/cloudbuild-order-processing-job.yaml `
    --project=$PROJECT_ID `
    --quiet
  if ($LASTEXITCODE -ne 0) { throw "Cloud Build failed" }
  $BUILD_ID = gcloud builds list --project=$PROJECT_ID --limit=1 --format="value(id)"
} finally {
  Pop-Location
}

$secretNames = @(
  "OPENAI_API_KEY",
  "EBAY_CLIENT_ID",
  "EBAY_CLIENT_SECRET",
  "PRICECHARTING_API_KEY",
  "POKEMON_TCG_API_KEY",
  "RESEND_API_KEY"
)
$secretFlags = @()
foreach ($name in $secretNames) {
  $prevEap = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  gcloud secrets describe $name --project=$PROJECT_ID 2>$null | Out-Null
  $exists = $LASTEXITCODE -eq 0
  $ErrorActionPreference = $prevEap
  if ($exists) { $secretFlags += "${name}=${name}:latest" }
}
$secretDeployArgs = @()
if ($secretFlags.Count -gt 0) { $secretDeployArgs = @("--set-secrets=$($secretFlags -join ',')") }

$fbProjectId = Get-EnvValue "FIREBASE_PROJECT_ID"
if (-not $fbProjectId) { $fbProjectId = $PROJECT_ID }
$fbBucket = Get-EnvValue "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET"
if (-not $fbBucket) { $fbBucket = "$fbProjectId.appspot.com" }
$gradingUrl = Get-EnvValue "GRADING_SERVICE_URL"
if (-not $gradingUrl) { $gradingUrl = "https://grading-service-staging-XXXX.run.app" }

$jobEnvPath = Join-Path $env:TEMP "order-processing-job-env.yaml"
@"
REQUIRE_FIRESTORE: "true"
FIREBASE_PROJECT_ID: "$fbProjectId"
NEXT_PUBLIC_FIREBASE_PROJECT_ID: "$fbProjectId"
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: "$fbBucket"
GRADING_SERVICE_URL: "$gradingUrl"
ORDER_PROCESSING_WORKER: "cloud_run_job"
CARD_PROCESSING_PIPELINE_MODE: "v2_primary"
V1_FULL_ANALYSIS_ON_SUBMIT: "false"
V1_PRICING_ON_SUBMIT: "false"
V1_ANALYSIS_ASYNC_ENABLED: "false"
CARD_PROCESSING_CONCURRENCY: "2"
CARD_FLOW_V2_EVIDENCE_ENABLED: "true"
CARD_FLOW_V2_IDENTITY_ENABLED: "true"
CARD_FLOW_V2_MARKET_ENABLED: "true"
CARD_FLOW_V2_AUDIT_ENABLED: "true"
CARD_FLOW_V2_OFFER_PREVIEW_ENABLED: "true"
CARD_FLOW_V2_OFFER_INFLUENCE: "true"
CARD_FLOW_V2_MARKET_MAX_SUSPECTS: "1"
CARD_FLOW_V2_MARKET_ENABLE_EBAY: "true"
CARD_FLOW_V2_MARKET_ENABLE_PRICECHARTING: "true"
CARD_FLOW_V2_MARKET_ENABLE_TCGPLAYER: "true"
OPENAI_REQUEST_TIMEOUT_MS: "60000"
ORDER_PROCESSING_STUCK_THRESHOLD_MS: "600000"
ORDER_READY_CUSTOMER_EMAIL_ENABLED: "true"
ORDER_READY_CUSTOMER_EMAIL_START_AT: "2026-07-05T00:00:00.000Z"
ORDER_READY_CUSTOMER_EMAIL_FROM: "reports@cardscanner9000.com"
ORDER_READY_CUSTOMER_EMAIL_FROM_NAME: "Card Scanner Reports"
"@ | Set-Content -Path $jobEnvPath -Encoding utf8

Write-Host "==> Deploy Cloud Run Job $JOB_NAME"
gcloud run jobs deploy $JOB_NAME `
  --image=$IMAGE `
  --region=$REGION `
  --project=$PROJECT_ID `
  --memory=4Gi `
  --cpu=4 `
  --task-timeout=3600 `
  --max-retries=0 `
  --parallelism=1 `
  @secretDeployArgs `
  --env-vars-file=$jobEnvPath `
  --quiet

if ($LASTEXITCODE -ne 0) { throw "Cloud Run Job deploy failed" }

$PROJECT_NUMBER = gcloud projects describe $PROJECT_ID --format="value(projectNumber)"
$RUN_SA = "$PROJECT_NUMBER-compute@developer.gserviceaccount.com"

Write-Host "==> Grant job SA Firestore access (ADC, no JSON key)"
gcloud projects add-iam-policy-binding $PROJECT_ID `
  --member="serviceAccount:$RUN_SA" `
  --role="roles/datastore.user" `
  --quiet 2>&1 | Out-Null

Write-Host "==> Grant web service SA permission to invoke job"
gcloud run jobs add-iam-policy-binding $JOB_NAME `
  --region=$REGION `
  --project=$PROJECT_ID `
  --member="serviceAccount:$RUN_SA" `
  --role="roles/run.invoker" `
  --quiet

Write-Host ""
Write-Host "=== ORDER PROCESSING JOB DEPLOYED ==="
Write-Host "Cloud Build ID: $BUILD_ID"
Write-Host "Job:            $JOB_NAME ($REGION)"
Write-Host "Image:          $IMAGE"
Write-Host "Manual run:     gcloud run jobs execute $JOB_NAME --region=$REGION --project=$PROJECT_ID --args=`"--order-id,<ORDER_UUID>`" --wait"
