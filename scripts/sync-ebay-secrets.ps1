# Sync EBAY_CLIENT_ID and EBAY_CLIENT_SECRET from web/.env.local to GCP Secret Manager
$ErrorActionPreference = "Stop"
$PROJECT_ID = "trading-card-buyback-dev"
$ENV_FILE = Join-Path $PSScriptRoot "..\web\.env.local"

function Get-EnvValue([string]$Name) {
  foreach ($line in Get-Content $ENV_FILE) {
    if ($line -match "${Name}=(.*)$") { return $Matches[1].Trim() }
  }
  return ""
}

function Sync-Secret([string]$Name, [string]$Value) {
  if (-not $Value) {
    throw "${Name} not found in web/.env.local. Save the file and try again."
  }

  $tmp = Join-Path $env:TEMP "$Name.txt"
  [System.IO.File]::WriteAllText($tmp, $Value)
  try {
    $prevEap = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    gcloud secrets describe $Name --project=$PROJECT_ID 2>$null | Out-Null
    $exists = $LASTEXITCODE -eq 0
    $ErrorActionPreference = $prevEap

    if ($exists) {
      Write-Host "Updating secret $Name..."
      gcloud secrets versions add $Name --project=$PROJECT_ID --data-file=$tmp
    } else {
      Write-Host "Creating secret $Name..."
      gcloud secrets create $Name --project=$PROJECT_ID --data-file=$tmp
    }
    if ($LASTEXITCODE -ne 0) { throw "Failed to write $Name secret" }
  } finally {
    Remove-Item $tmp -Force -ErrorAction SilentlyContinue
  }
}

$clientId = Get-EnvValue "EBAY_CLIENT_ID"
$clientSecret = Get-EnvValue "EBAY_CLIENT_SECRET"

gcloud services enable secretmanager.googleapis.com --project=$PROJECT_ID --quiet

Sync-Secret "EBAY_CLIENT_ID" $clientId
Sync-Secret "EBAY_CLIENT_SECRET" $clientSecret

$PROJECT_NUMBER = gcloud projects describe $PROJECT_ID --format="value(projectNumber)"
$RUN_SA = "$PROJECT_NUMBER-compute@developer.gserviceaccount.com"
foreach ($name in @("EBAY_CLIENT_ID", "EBAY_CLIENT_SECRET")) {
  Write-Host "Granting secretAccessor on $name to $RUN_SA"
  gcloud secrets add-iam-policy-binding $name `
    --project=$PROJECT_ID `
    --member="serviceAccount:$RUN_SA" `
    --role="roles/secretmanager.secretAccessor" `
    --quiet
}

Write-Host "Done - eBay secrets are in Secret Manager."
