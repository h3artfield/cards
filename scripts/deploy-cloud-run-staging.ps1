# Staging Cloud Run deployment for trading-card-buyback-dev
# Usage (from repo root): .\scripts\deploy-cloud-run-staging.ps1

$ErrorActionPreference = "Stop"
if (Get-Variable -Name PSNativeCommandUseErrorActionPreference -ErrorAction SilentlyContinue) {
  $PSNativeCommandUseErrorActionPreference = $false
}

$PROJECT_ID = "trading-card-buyback-dev"
$REGION = "us-central1"
$REPO = "buyback"
$WEB_SERVICE = "buyback-web-staging"
$GRADING_SERVICE = "grading-service-staging"
$USE_ADC_FOR_FIREBASE = $true
$ENV_FILE = Join-Path $PSScriptRoot "..\web\.env.local"

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

function Write-WebEnvFile([string]$Path, [hashtable]$Vars) {
  $lines = @()
  foreach ($key in $Vars.Keys) {
    $val = [string]$Vars[$key]
    $val = $val -replace '"', '\"'
    $lines += "${key}: `"$val`""
  }
  Set-Content -Path $Path -Value ($lines -join "`n") -Encoding utf8
}

function Ensure-Secret([string]$Name, [string]$Value) {
  if (-not $Value) {
    Write-Host "  skip $Name (empty)"
    return $false
  }
  $exists = $false
  try {
    gcloud secrets describe $Name --project=$PROJECT_ID 2>$null | Out-Null
    if ($LASTEXITCODE -eq 0) { $exists = $true }
  } catch {
    $exists = $false
  }
  if (-not $exists) {
    Write-Host "  create secret $Name"
    $Value | gcloud secrets create $Name --project=$PROJECT_ID --data-file=-
  } else {
    Write-Host "  update secret $Name"
    $Value | gcloud secrets versions add $Name --project=$PROJECT_ID --data-file=-
  }
  if ($LASTEXITCODE -ne 0) { throw "Failed to sync secret $Name" }
  return $true
}

Write-Host "==> Configuring gcloud project $PROJECT_ID"
gcloud config set project $PROJECT_ID

Write-Host "==> Enabling APIs"
gcloud services enable run.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com cloudbuild.googleapis.com firestore.googleapis.com --project=$PROJECT_ID

Write-Host "==> Artifact Registry"
$repoExists = $false
$prevEap = $ErrorActionPreference
$ErrorActionPreference = "Continue"
gcloud artifacts repositories describe $REPO --location=$REGION --project=$PROJECT_ID 2>&1 | Out-Null
if ($LASTEXITCODE -eq 0) { $repoExists = $true }
if (-not $repoExists) {
  gcloud artifacts repositories create $REPO --repository-format=docker --location=$REGION --project=$PROJECT_ID 2>&1 | Out-Null
  if ($LASTEXITCODE -ne 0) {
    gcloud artifacts repositories describe $REPO --location=$REGION --project=$PROJECT_ID 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) {
      $ErrorActionPreference = $prevEap
      throw "Failed to ensure Artifact Registry repository $REPO"
    }
  }
}
$ErrorActionPreference = $prevEap

$REGISTRY = "$REGION-docker.pkg.dev/$PROJECT_ID/$REPO"
gcloud auth configure-docker "$REGION-docker.pkg.dev" --quiet

Write-Host "==> Secret Manager"
$openai = Get-EnvValue "OPENAI_API_KEY"
$adminSession = Get-EnvValue "ADMIN_SESSION_SECRET"
if (-not $adminSession) { $adminSession = Get-EnvValue "ADMIN_SECRET" }
if (-not $adminSession) { $adminSession = [guid]::NewGuid().ToString("N") + [guid]::NewGuid().ToString("N") }
$pokemon = Get-EnvValue "POKEMON_TCG_API_KEY"
$priceCharting = Get-EnvValue "PRICECHARTING_API_KEY"
$resend = Get-EnvValue "RESEND_API_KEY"
$firebaseKey = Get-EnvValue "FIREBASE_SERVICE_ACCOUNT_KEY"

$secretsCreated = @()
if (Ensure-Secret "OPENAI_API_KEY" $openai) { $secretsCreated += "OPENAI_API_KEY" }
if (Ensure-Secret "ADMIN_SESSION_SECRET" $adminSession) { $secretsCreated += "ADMIN_SESSION_SECRET" }
if (Ensure-Secret "POKEMON_TCG_API_KEY" $pokemon) { $secretsCreated += "POKEMON_TCG_API_KEY" }
if (Ensure-Secret "PRICECHARTING_API_KEY" $priceCharting) { $secretsCreated += "PRICECHARTING_API_KEY" }
if (Ensure-Secret "RESEND_API_KEY" $resend) { $secretsCreated += "RESEND_API_KEY" }
if (-not $USE_ADC_FOR_FIREBASE) {
  if (Ensure-Secret "FIREBASE_SERVICE_ACCOUNT_KEY" $firebaseKey) { $secretsCreated += "FIREBASE_SERVICE_ACCOUNT_KEY" }
} else {
  Write-Host "  skip FIREBASE_SERVICE_ACCOUNT_KEY mount (using Cloud Run ADC + IAM)"
}

Write-Host "==> Grant Cloud Run SA access to secrets + Firestore + Storage"
$PROJECT_NUMBER = (gcloud projects describe $PROJECT_ID --format="value(projectNumber)")
$RUN_SA = "$PROJECT_NUMBER-compute@developer.gserviceaccount.com"
$prevEap = $ErrorActionPreference
$ErrorActionPreference = "Continue"
foreach ($s in $secretsCreated) {
  gcloud secrets add-iam-policy-binding $s `
    --project=$PROJECT_ID `
    --member="serviceAccount:$RUN_SA" `
    --role="roles/secretmanager.secretAccessor" `
    --quiet 2>&1 | Out-Null
}
gcloud projects add-iam-policy-binding $PROJECT_ID `
  --member="serviceAccount:$RUN_SA" `
  --role="roles/datastore.user" `
  --quiet 2>&1 | Out-Null
gcloud projects add-iam-policy-binding $PROJECT_ID `
  --member="serviceAccount:$RUN_SA" `
  --role="roles/storage.objectAdmin" `
  --quiet 2>&1 | Out-Null
$ErrorActionPreference = $prevEap
Write-Host "  Cloud Run service account: $RUN_SA"

Write-Host "==> Build grading-service"
Push-Location (Join-Path $PSScriptRoot "..\services\grading-service")
docker build -t "${REGISTRY}/grading-service-staging:latest" .
docker push "${REGISTRY}/grading-service-staging:latest"
Pop-Location

Write-Host "==> Deploy grading-service-staging"
gcloud run deploy $GRADING_SERVICE `
  --image="${REGISTRY}/grading-service-staging:latest" `
  --region=$REGION `
  --project=$PROJECT_ID `
  --platform=managed `
  --allow-unauthenticated `
  --port=8001 `
  --memory=512Mi `
  --cpu=1 `
  --min-instances=0 `
  --max-instances=3 `
  --quiet

$GRADING_URL = (gcloud run services describe $GRADING_SERVICE --region=$REGION --project=$PROJECT_ID --format="value(status.url)")
Write-Host "Grading URL: $GRADING_URL"

Write-Host "==> Build buyback-web (first pass, URL unknown)"
$fbApiKey = Get-EnvValue "NEXT_PUBLIC_FIREBASE_API_KEY"
$fbAuthDomain = Get-EnvValue "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN"
$fbProjectId = Get-EnvValue "NEXT_PUBLIC_FIREBASE_PROJECT_ID"
$fbBucket = Get-EnvValue "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET"
$fbSender = Get-EnvValue "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID"
$fbAppId = Get-EnvValue "NEXT_PUBLIC_FIREBASE_APP_ID"

Push-Location (Join-Path $PSScriptRoot "..\web")
docker build `
  --build-arg NEXT_PUBLIC_FIREBASE_API_KEY=$fbApiKey `
  --build-arg NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=$fbAuthDomain `
  --build-arg NEXT_PUBLIC_FIREBASE_PROJECT_ID=$fbProjectId `
  --build-arg NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=$fbBucket `
  --build-arg NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=$fbSender `
  --build-arg NEXT_PUBLIC_FIREBASE_APP_ID=$fbAppId `
  --build-arg NEXT_PUBLIC_APP_URL=https://placeholder.run.app `
  -t "${REGISTRY}/buyback-web-staging:latest" .
docker push "${REGISTRY}/buyback-web-staging:latest"
Pop-Location

$secretFlags = @()
foreach ($name in @("OPENAI_API_KEY", "ADMIN_SESSION_SECRET", "POKEMON_TCG_API_KEY", "PRICECHARTING_API_KEY", "RESEND_API_KEY")) {
  if ($secretsCreated -contains $name) {
    $secretFlags += "${name}=${name}:latest"
  }
}
if (-not $USE_ADC_FOR_FIREBASE -and ($secretsCreated -contains "FIREBASE_SERVICE_ACCOUNT_KEY")) {
  $secretFlags += "FIREBASE_SERVICE_ACCOUNT_KEY=FIREBASE_SERVICE_ACCOUNT_KEY:latest"
}
$secretArg = $secretFlags -join ","
$secretDeployArgs = @()
if ($secretArg) { $secretDeployArgs = @("--set-secrets=$secretArg") }

function Deploy-WebService([string]$AppUrl) {
  $envFile = Join-Path $env:TEMP "buyback-web-staging-env.yaml"
  Write-WebEnvFile $envFile @{
    FIREBASE_PROJECT_ID = $fbProjectId
    NEXT_PUBLIC_FIREBASE_PROJECT_ID = $fbProjectId
    NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET = $fbBucket
    GRADING_SERVICE_URL = $GRADING_URL
    REQUIRE_FIRESTORE = "true"
    APP_URL = $AppUrl
    NEXT_PUBLIC_APP_URL = $AppUrl
  }
  gcloud run deploy $WEB_SERVICE `
    --image="${REGISTRY}/buyback-web-staging:latest" `
    --region=$REGION `
    --project=$PROJECT_ID `
    --platform=managed `
    --allow-unauthenticated `
    --port=8080 `
    --memory=1Gi `
    --cpu=1 `
    --timeout=300 `
    --min-instances=0 `
    --max-instances=5 `
    @secretDeployArgs `
    --env-vars-file=$envFile `
    --quiet
  if ($LASTEXITCODE -ne 0) { throw "Cloud Run deploy failed for $WEB_SERVICE" }
}

Write-Host "==> Deploy buyback-web-staging (initial)"
Deploy-WebService "https://placeholder.run.app"

$WEB_URL = (gcloud run services describe $WEB_SERVICE --region=$REGION --project=$PROJECT_ID --format="value(status.url)")
Write-Host "Web URL: $WEB_URL"

Write-Host "==> Rebuild web with NEXT_PUBLIC_APP_URL=$WEB_URL"
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

Write-Host "==> Redeploy buyback-web-staging with APP_URL"
Deploy-WebService $WEB_URL

Write-Host "==> Deploy Firestore + Storage rules"
Push-Location (Join-Path $PSScriptRoot "..")
npx --yes firebase-tools deploy --only firestore:rules,storage --project $PROJECT_ID
Pop-Location

Write-Host ""
Write-Host "=== STAGING DEPLOY COMPLETE ==="
Write-Host "Web:     $WEB_URL"
Write-Host "Grading: $GRADING_URL"
Write-Host "Secrets: $($secretsCreated -join ', ')"
Write-Host "Firebase auth: $(if ($USE_ADC_FOR_FIREBASE) { 'ADC + IAM (no JSON key in container)' } else { 'service account key secret' })"
Write-Host "Store:   $WEB_URL/s/the-game-lodge"
Write-Host "Admin:   $WEB_URL/admin/login"
