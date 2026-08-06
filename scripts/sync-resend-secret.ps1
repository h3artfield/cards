# Sync RESEND_API_KEY from web/.env.local to GCP Secret Manager.
$ErrorActionPreference = "Stop"
$PROJECT_ID = "trading-card-buyback-dev"
$ENV_FILE = Join-Path $PSScriptRoot "..\web\.env.local"

function Get-EnvValue([string]$Name) {
  foreach ($line in Get-Content $ENV_FILE) {
    if ($line -match "^\s*$Name=(.*)$") {
      $val = $Matches[1].Trim()
      if ($val.StartsWith('"') -and $val.EndsWith('"')) { $val = $val.Substring(1, $val.Length - 2) }
      if ($val.StartsWith("'") -and $val.EndsWith("'")) { $val = $val.Substring(1, $val.Length - 2) }
      return $val
    }
  }
  return ""
}

$apiKey = Get-EnvValue "RESEND_API_KEY"
if (-not $apiKey) {
  throw "RESEND_API_KEY not found in web/.env.local"
}
$apiKey = $apiKey.Trim().TrimStart([char]0xFEFF)

gcloud services enable secretmanager.googleapis.com --project=$PROJECT_ID --quiet

$tmp = Join-Path $env:TEMP "resend-api-key.txt"
[System.IO.File]::WriteAllText($tmp, $apiKey)
try {
  $prevEap = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  gcloud secrets describe RESEND_API_KEY --project=$PROJECT_ID 2>$null | Out-Null
  $exists = $LASTEXITCODE -eq 0
  $ErrorActionPreference = $prevEap
  if ($exists) {
    Write-Host "Updating secret RESEND_API_KEY..."
    gcloud secrets versions add RESEND_API_KEY --project=$PROJECT_ID --data-file=$tmp
  } else {
    Write-Host "Creating secret RESEND_API_KEY..."
    gcloud secrets create RESEND_API_KEY --project=$PROJECT_ID --data-file=$tmp
  }
} finally {
  Remove-Item $tmp -Force -ErrorAction SilentlyContinue
}

$PROJECT_NUMBER = gcloud projects describe $PROJECT_ID --format="value(projectNumber)"
$RUN_SA = "$PROJECT_NUMBER-compute@developer.gserviceaccount.com"
gcloud secrets add-iam-policy-binding RESEND_API_KEY `
  --project=$PROJECT_ID `
  --member="serviceAccount:$RUN_SA" `
  --role="roles/secretmanager.secretAccessor" `
  --quiet

Write-Host "Done - RESEND_API_KEY synced to Secret Manager."
