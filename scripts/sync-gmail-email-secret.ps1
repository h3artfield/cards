# Sync GMAIL_APP_PASSWORD from web/.env.local to GCP Secret Manager.
$ErrorActionPreference = "Stop"
$PROJECT_ID = "trading-card-buyback-dev"
$ENV_FILE = Join-Path $PSScriptRoot "..\web\.env.local"

function Get-EnvValue([string]$Name) {
  foreach ($line in Get-Content $ENV_FILE) {
    if ($line -match "^\s*$Name=(.*)$") {
      $val = $Matches[1].Trim()
      if ($val.StartsWith('"') -and $val.EndsWith('"')) { $val = $val.Substring(1, $val.Length - 2) }
      return $val
    }
  }
  return ""
}

$pass = Get-EnvValue "GMAIL_APP_PASSWORD"
if (-not $pass) {
  throw "GMAIL_APP_PASSWORD not found in web/.env.local"
}

gcloud services enable secretmanager.googleapis.com --project=$PROJECT_ID --quiet

$tmp = Join-Path $env:TEMP "gmail-app-password.txt"
[System.IO.File]::WriteAllText($tmp, $pass)
try {
  $prevEap = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  gcloud secrets describe GMAIL_APP_PASSWORD --project=$PROJECT_ID 2>$null | Out-Null
  $exists = $LASTEXITCODE -eq 0
  $ErrorActionPreference = $prevEap
  if ($exists) {
    Write-Host "Updating secret GMAIL_APP_PASSWORD..."
    gcloud secrets versions add GMAIL_APP_PASSWORD --project=$PROJECT_ID --data-file=$tmp
  } else {
    Write-Host "Creating secret GMAIL_APP_PASSWORD..."
    gcloud secrets create GMAIL_APP_PASSWORD --project=$PROJECT_ID --data-file=$tmp
  }
} finally {
  Remove-Item $tmp -Force -ErrorAction SilentlyContinue
}

$PROJECT_NUMBER = gcloud projects describe $PROJECT_ID --format="value(projectNumber)"
$RUN_SA = "$PROJECT_NUMBER-compute@developer.gserviceaccount.com"
gcloud secrets add-iam-policy-binding GMAIL_APP_PASSWORD `
  --project=$PROJECT_ID `
  --member="serviceAccount:$RUN_SA" `
  --role="roles/secretmanager.secretAccessor" `
  --quiet

Write-Host "Done - GMAIL_APP_PASSWORD synced to Secret Manager."
