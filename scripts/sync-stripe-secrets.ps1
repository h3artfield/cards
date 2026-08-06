# Sync Stripe secrets from web/.env.local to GCP Secret Manager.
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

function Sync-Secret([string]$Name, [string]$Value) {
  if (-not $Value) {
    Write-Host "Skip $Name (empty in .env.local)"
    return
  }
  gcloud services enable secretmanager.googleapis.com --project=$PROJECT_ID --quiet
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
  } finally {
    Remove-Item $tmp -Force -ErrorAction SilentlyContinue
  }

  $PROJECT_NUMBER = gcloud projects describe $PROJECT_ID --format="value(projectNumber)"
  $RUN_SA = "$PROJECT_NUMBER-compute@developer.gserviceaccount.com"
  gcloud secrets add-iam-policy-binding $Name `
    --project=$PROJECT_ID `
    --member="serviceAccount:$RUN_SA" `
    --role="roles/secretmanager.secretAccessor" `
    --quiet
}

$secretKey = Get-EnvValue "STRIPE_SECRET_KEY"
$webhookSecret = Get-EnvValue "STRIPE_WEBHOOK_SECRET"

Sync-Secret "STRIPE_SECRET_KEY" $secretKey
Sync-Secret "STRIPE_WEBHOOK_SECRET" $webhookSecret

$priceId = Get-EnvValue "STRIPE_PRICE_ID_CARD_SCANNER_STORE_MONTHLY"
if ($priceId) {
  Write-Host "STRIPE_PRICE_ID_CARD_SCANNER_STORE_MONTHLY=$priceId (set via deploy env-vars-file from .env.local)"
} else {
  Write-Host "WARN: STRIPE_PRICE_ID_CARD_SCANNER_STORE_MONTHLY not in .env.local - run setup-stripe-store-plan.ts first"
}

Write-Host "Done - Stripe secrets synced. Redeploy: scripts/deploy-web-staging-cloudbuild.ps1"
