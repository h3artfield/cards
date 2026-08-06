# Sync PRICECHARTING_API_KEY from web/.env.local to GCP Secret Manager
$ErrorActionPreference = "Stop"
$PROJECT_ID = "trading-card-buyback-dev"
$ENV_FILE = Join-Path $PSScriptRoot "..\web\.env.local"

function Get-EnvValue([string]$Name) {
  foreach ($line in Get-Content $ENV_FILE) {
    if ($line -match "${Name}=(.*)$") { return $Matches[1].Trim() }
  }
  return ""
}

$key = Get-EnvValue "PRICECHARTING_API_KEY"
if (-not $key) {
  throw "PRICECHARTING_API_KEY not found in web/.env.local. Save the file and try again."
}

gcloud services enable secretmanager.googleapis.com --project=$PROJECT_ID --quiet

$tmp = Join-Path $env:TEMP "pricecharting-key.txt"
[System.IO.File]::WriteAllText($tmp, $key)
try {
  $prevEap = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  gcloud secrets describe PRICECHARTING_API_KEY --project=$PROJECT_ID 2>$null | Out-Null
  $exists = $LASTEXITCODE -eq 0
  $ErrorActionPreference = $prevEap

  if ($exists) {
    Write-Host "Updating secret PRICECHARTING_API_KEY..."
    gcloud secrets versions add PRICECHARTING_API_KEY --project=$PROJECT_ID --data-file=$tmp
  } else {
    Write-Host "Creating secret PRICECHARTING_API_KEY..."
    gcloud secrets create PRICECHARTING_API_KEY --project=$PROJECT_ID --data-file=$tmp
  }
  if ($LASTEXITCODE -ne 0) { throw "Failed to write PRICECHARTING_API_KEY secret" }
} finally {
  Remove-Item $tmp -Force -ErrorAction SilentlyContinue
}

$PROJECT_NUMBER = gcloud projects describe $PROJECT_ID --format="value(projectNumber)"
$RUN_SA = "$PROJECT_NUMBER-compute@developer.gserviceaccount.com"
Write-Host "Granting secretAccessor to $RUN_SA"
gcloud secrets add-iam-policy-binding PRICECHARTING_API_KEY `
  --project=$PROJECT_ID `
  --member="serviceAccount:$RUN_SA" `
  --role="roles/secretmanager.secretAccessor" `
  --quiet

Write-Host "Done - PRICECHARTING_API_KEY is in Secret Manager."
