# Deploy Cloud Run Job + Cloud Scheduler for daily PriceCharting import.
# Uses Cloud Build (no local Docker). Usage: .\scripts\deploy-pricecharting-daily-job.ps1

$ErrorActionPreference = "Stop"
if (Get-Variable -Name PSNativeCommandUseErrorActionPreference -ErrorAction SilentlyContinue) {
  $PSNativeCommandUseErrorActionPreference = $false
}

$PROJECT_ID = "trading-card-buyback-dev"
$REGION = "us-central1"
$REPO = "buyback"
$JOB_NAME = "pricecharting-daily-import"
$SCHEDULER_NAME = "pricecharting-daily-import"
$SCHEDULE = "0 6 * * *"
$ARCHIVE_BUCKET = "$PROJECT_ID-pricecharting"
$REPO_ROOT = Join-Path $PSScriptRoot ".."
$ENV_FILE = Join-Path $PSScriptRoot "..\web\.env.local"
$IMAGE = "us-central1-docker.pkg.dev/$PROJECT_ID/$REPO/pricecharting-daily:latest"

function Get-EnvValue([string]$Name) {
  if (-not (Test-Path $ENV_FILE)) { return $null }
  foreach ($line in Get-Content $ENV_FILE) {
    if ($line -match "^\s*$Name=(.*)$") {
      $val = $Matches[1].Trim()
      if ($val.StartsWith('"') -and $val.EndsWith('"')) { $val = $val.Substring(1, $val.Length - 2) }
      return $val
    }
  }
  return $null
}

Write-Host "==> Configuring gcloud project $PROJECT_ID"
gcloud config set project $PROJECT_ID

Write-Host "==> Enabling APIs"
gcloud services enable `
  run.googleapis.com `
  cloudscheduler.googleapis.com `
  artifactregistry.googleapis.com `
  secretmanager.googleapis.com `
  cloudbuild.googleapis.com `
  firestore.googleapis.com `
  storage.googleapis.com `
  --project=$PROJECT_ID

Write-Host "==> Ensure archive bucket gs://$ARCHIVE_BUCKET"
$prevEap = $ErrorActionPreference
$ErrorActionPreference = "Continue"
gcloud storage buckets describe "gs://$ARCHIVE_BUCKET" --project=$PROJECT_ID 2>$null | Out-Null
$bucketExists = $LASTEXITCODE -eq 0
$ErrorActionPreference = $prevEap
if (-not $bucketExists) {
  gcloud storage buckets create "gs://$ARCHIVE_BUCKET" --project=$PROJECT_ID --location=$REGION --uniform-bucket-level-access
  if ($LASTEXITCODE -ne 0) { throw "Failed to create archive bucket gs://$ARCHIVE_BUCKET" }
}

Write-Host "==> Cloud Build (pricecharting-daily job image)"
Push-Location $REPO_ROOT
gcloud builds submit . `
  --project=$PROJECT_ID `
  --config=scripts/cloudbuild-pricecharting-job.yaml
Pop-Location
if ($LASTEXITCODE -ne 0) { throw "Cloud Build failed for pricecharting-daily job" }

$BUILD_ID = gcloud builds list --project=$PROJECT_ID --limit=1 --format="value(id)"
Write-Host "Cloud Build ID: $BUILD_ID"

$fbProjectId = Get-EnvValue "FIREBASE_PROJECT_ID"
if (-not $fbProjectId) { $fbProjectId = Get-EnvValue "NEXT_PUBLIC_FIREBASE_PROJECT_ID" }
if (-not $fbProjectId) { $fbProjectId = $PROJECT_ID }

$secretNames = @(
  "PRICECHARTING_CSV_POKEMON_URL",
  "PRICECHARTING_CSV_MAGIC_URL",
  "PRICECHARTING_CSV_YUGIOH_URL",
  "PRICECHARTING_CSV_ONEPIECE_URL",
  "RESEND_API_KEY"
)
$secretFlags = @()
foreach ($name in $secretNames) {
  $prevEap = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  gcloud secrets describe $name --project=$PROJECT_ID 2>$null | Out-Null
  $exists = $LASTEXITCODE -eq 0
  $ErrorActionPreference = $prevEap
  if ($exists) {
    $secretFlags += "${name}=${name}:latest"
  } else {
    Write-Warning "Secret $name not found - run .\scripts\sync-pricecharting-csv-secrets.ps1 first"
  }
}
$secretArg = $secretFlags -join ","
$secretDeployArgs = @()
if ($secretArg) { $secretDeployArgs = @("--set-secrets=$secretArg") }

$emailTo = Get-EnvValue "PRICECHARTING_IMPORT_EMAIL_TO"
if (-not $emailTo) { $emailTo = "h3artfield@gmail.com" }
$emailFrom = Get-EnvValue "PRICECHARTING_IMPORT_EMAIL_FROM"
if (-not $emailFrom) { $emailFrom = "reports@cardscanner9000.com" }
$emailFromName = Get-EnvValue "PRICECHARTING_IMPORT_EMAIL_FROM_NAME"
if (-not $emailFromName) { $emailFromName = "Card Scanner Reports" }

$jobEnvPath = Join-Path $env:TEMP "pricecharting-daily-job-env.yaml"
@"
REQUIRE_FIRESTORE: "true"
FIREBASE_PROJECT_ID: "$fbProjectId"
NEXT_PUBLIC_FIREBASE_PROJECT_ID: "$fbProjectId"
PRICECHARTING_ARCHIVE_BUCKET: "$ARCHIVE_BUCKET"
PRICECHARTING_IMPORT_EMAIL_PROVIDER: "resend"
PRICECHARTING_IMPORT_EMAIL_TO: "$emailTo"
PRICECHARTING_IMPORT_EMAIL_FROM: "$emailFrom"
PRICECHARTING_IMPORT_EMAIL_FROM_NAME: "$emailFromName"
"@ | Set-Content -Path $jobEnvPath -Encoding utf8

Write-Host "==> Deploy Cloud Run Job $JOB_NAME"
gcloud run jobs deploy $JOB_NAME `
  --image=$IMAGE `
  --region=$REGION `
  --project=$PROJECT_ID `
  --memory=2Gi `
  --cpu=2 `
  --task-timeout=3600 `
  --max-retries=0 `
  @secretDeployArgs `
  --env-vars-file=$jobEnvPath `
  --quiet

if ($LASTEXITCODE -ne 0) { throw "Cloud Run Job deploy failed" }

Write-Host "==> Grant Cloud Run SA Firestore + Storage access"
$PROJECT_NUMBER = gcloud projects describe $PROJECT_ID --format="value(projectNumber)"
$RUN_SA = "$PROJECT_NUMBER-compute@developer.gserviceaccount.com"
$prevEap = $ErrorActionPreference
$ErrorActionPreference = "Continue"
gcloud projects add-iam-policy-binding $PROJECT_ID `
  --member="serviceAccount:$RUN_SA" `
  --role="roles/datastore.user" `
  --quiet 2>&1 | Out-Null
gcloud storage buckets add-iam-policy-binding "gs://$ARCHIVE_BUCKET" `
  --member="serviceAccount:$RUN_SA" `
  --role="roles/storage.objectAdmin" `
  --quiet 2>&1 | Out-Null
gcloud run jobs add-iam-policy-binding $JOB_NAME `
  --region=$REGION `
  --project=$PROJECT_ID `
  --member="serviceAccount:$RUN_SA" `
  --role="roles/run.invoker" `
  --quiet 2>&1 | Out-Null
$ErrorActionPreference = $prevEap

Write-Host "==> Cloud Scheduler $SCHEDULER_NAME ($SCHEDULE UTC)"
$jobUri = "https://$REGION-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/$PROJECT_ID/jobs/${JOB_NAME}:run"

$prevEap = $ErrorActionPreference
$ErrorActionPreference = "Continue"
gcloud scheduler jobs describe $SCHEDULER_NAME --location=$REGION --project=$PROJECT_ID 2>$null | Out-Null
$schedulerExists = $LASTEXITCODE -eq 0
$ErrorActionPreference = $prevEap

if ($schedulerExists) {
  gcloud scheduler jobs update http $SCHEDULER_NAME `
    --location=$REGION `
    --project=$PROJECT_ID `
    --schedule=$SCHEDULE `
    --uri=$jobUri `
    --http-method=POST `
    --oauth-service-account-email=$RUN_SA `
    --quiet
} else {
  gcloud scheduler jobs create http $SCHEDULER_NAME `
    --location=$REGION `
    --project=$PROJECT_ID `
    --schedule=$SCHEDULE `
    --uri=$jobUri `
    --http-method=POST `
    --oauth-service-account-email=$RUN_SA `
    --quiet
}

if ($LASTEXITCODE -ne 0) { throw "Cloud Scheduler setup failed" }

Write-Host ""
Write-Host "=== PRICECHARTING DAILY JOB DEPLOYED ==="
Write-Host "Cloud Build ID: $BUILD_ID"
Write-Host "Job:            $JOB_NAME ($REGION)"
Write-Host "Image:          $IMAGE"
Write-Host "Archive bucket: gs://$ARCHIVE_BUCKET"
Write-Host "Schedule:       $SCHEDULE UTC via $SCHEDULER_NAME"
Write-Host "Manual run:     gcloud run jobs execute $JOB_NAME --region=$REGION --project=$PROJECT_ID --wait"

Write-Host ""
Write-Host "==> Send test PriceCharting import email via Resend"
$prevEap = $ErrorActionPreference
$ErrorActionPreference = "Continue"
$resendKey = gcloud secrets versions access latest --secret=RESEND_API_KEY --project=$PROJECT_ID 2>$null
$ErrorActionPreference = $prevEap
if ($resendKey) {
  $resendKey = $resendKey.Trim().TrimStart([char]0xFEFF)
}
if (-not $resendKey) {
  Write-Warning "RESEND_API_KEY not readable locally - sending test email via Cloud Run Job execute"
  gcloud run jobs execute $JOB_NAME `
    --region=$REGION `
    --project=$PROJECT_ID `
    --args="npx,tsx,scripts/daily-pricecharting.ts,--test-import-email" `
    --wait
  if ($LASTEXITCODE -ne 0) { Write-Warning "Test import email job failed - check Cloud Run logs" }
} else {
  Push-Location (Join-Path $REPO_ROOT "web")
  try {
    $env:RESEND_API_KEY = $resendKey
    $env:PRICECHARTING_IMPORT_EMAIL_PROVIDER = "resend"
    $env:PRICECHARTING_IMPORT_EMAIL_TO = $emailTo
    $env:PRICECHARTING_IMPORT_EMAIL_FROM = $emailFrom
    $env:PRICECHARTING_IMPORT_EMAIL_FROM_NAME = $emailFromName
    npm run email:test:pricecharting-import
    if ($LASTEXITCODE -ne 0) { Write-Warning "Test import email failed." }
  } finally {
    Remove-Item Env:RESEND_API_KEY -ErrorAction SilentlyContinue
    Pop-Location
  }
}
