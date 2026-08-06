# Sync PriceCharting Legendary CSV download URLs from web/.env.local to Secret Manager.
# Never commit these URLs/tokens — they live in .env.local and GCP secrets only.
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

function Ensure-Secret([string]$Name, [string]$Value) {
  if (-not $Value) {
    Write-Host "  skip $Name (empty in .env.local)"
    return $false
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
      Write-Host "  update secret $Name"
      gcloud secrets versions add $Name --project=$PROJECT_ID --data-file=$tmp
    } else {
      Write-Host "  create secret $Name"
      gcloud secrets create $Name --project=$PROJECT_ID --data-file=$tmp
    }
    if ($LASTEXITCODE -ne 0) { throw "Failed to write secret $Name" }
    return $true
  } finally {
    Remove-Item $tmp -Force -ErrorAction SilentlyContinue
  }
}

if (-not (Test-Path $ENV_FILE)) {
  throw "Missing $ENV_FILE - add PRICECHARTING_CSV_*_URL values locally first."
}

gcloud services enable secretmanager.googleapis.com --project=$PROJECT_ID --quiet

$secretNames = @(
  "PRICECHARTING_CSV_POKEMON_URL",
  "PRICECHARTING_CSV_MAGIC_URL",
  "PRICECHARTING_CSV_YUGIOH_URL",
  "PRICECHARTING_CSV_ONEPIECE_URL"
)

$synced = @()
foreach ($name in $secretNames) {
  if (Ensure-Secret $name (Get-EnvValue $name)) { $synced += $name }
}

$PROJECT_NUMBER = gcloud projects describe $PROJECT_ID --format="value(projectNumber)"
$RUN_SA = "$PROJECT_NUMBER-compute@developer.gserviceaccount.com"
Write-Host "Granting secretAccessor to $RUN_SA"
foreach ($name in $synced) {
  gcloud secrets add-iam-policy-binding $name `
    --project=$PROJECT_ID `
    --member="serviceAccount:$RUN_SA" `
    --role="roles/secretmanager.secretAccessor" `
    --quiet
}

Write-Host "Done - synced $($synced.Count) PriceCharting CSV URL secret(s)."
