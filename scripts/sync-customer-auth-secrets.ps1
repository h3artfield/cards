# Sync Directive 013 customer auth secrets to GCP Secret Manager.
# Never prints secret values. Generates CUSTOMER_SESSION_SECRET if missing locally.
$ErrorActionPreference = "Stop"
$PROJECT_ID = "trading-card-buyback-dev"
$ENV_FILE = Join-Path $PSScriptRoot "..\web\.env.local"

function Get-EnvValue([string]$Name) {
  if (-not (Test-Path $ENV_FILE)) { return "" }
  foreach ($line in Get-Content $ENV_FILE) {
    if ($line -match "^\s*$Name=(.*)$") {
      $val = $Matches[1].Trim()
      if ($val.StartsWith('"') -and $val.EndsWith('"')) { $val = $val.Substring(1, $val.Length - 2) }
      return $val
    }
  }
  return ""
}

function Set-EnvValue([string]$Name, [string]$Value) {
  if (-not (Test-Path $ENV_FILE)) {
    New-Item -Path $ENV_FILE -ItemType File -Force | Out-Null
  }
  $lines = @(Get-Content $ENV_FILE)
  $found = $false
  $out = @()
  foreach ($line in $lines) {
    if ($line -match "^\s*$Name=") {
      $out += "$Name=$Value"
      $found = $true
    } else {
      $out += $line
    }
  }
  if (-not $found) { $out += "$Name=$Value" }
  Set-Content -Path $ENV_FILE -Value $out -Encoding utf8
}

function New-RandomSecret([int]$Bytes = 32) {
  $buf = New-Object byte[] $Bytes
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($buf)
  return [Convert]::ToBase64String($buf)
}

function Sync-Secret([string]$Name, [string]$Value) {
  if (-not $Value) {
    Write-Host "Skip $Name (no value)"
    return $false
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
  return $true
}

function Test-SecretEnabled([string]$Name) {
  $prevEap = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  $enabled = gcloud secrets versions list $Name --project=$PROJECT_ID --filter="state=ENABLED" --format="value(name)" 2>$null
  $ErrorActionPreference = $prevEap
  return ($LASTEXITCODE -eq 0 -and $enabled)
}

Write-Host "==> Customer auth secrets (Directive 013)"

$customerSession = Get-EnvValue "CUSTOMER_SESSION_SECRET"
if (-not $customerSession) {
  $customerSession = New-RandomSecret
  Set-EnvValue "CUSTOMER_SESSION_SECRET" $customerSession
  Write-Host "Generated CUSTOMER_SESSION_SECRET (saved to web/.env.local, not printed)"
}
Sync-Secret "CUSTOMER_SESSION_SECRET" $customerSession | Out-Null

$googleId = Get-EnvValue "GOOGLE_CLIENT_ID"
$googleSecret = Get-EnvValue "GOOGLE_CLIENT_SECRET"
$googleReady = $false
if ($googleId -and $googleSecret) {
  Sync-Secret "GOOGLE_CLIENT_ID" $googleId | Out-Null
  Sync-Secret "GOOGLE_CLIENT_SECRET" $googleSecret | Out-Null
  $googleReady = $true
  Write-Host "Google OAuth secrets synced (enable with AUTH_GOOGLE_ENABLED=true on deploy)"
} else {
  Write-Host "Google OAuth not configured in .env.local - Phase 1 deploy will use AUTH_GOOGLE_ENABLED=false"
}

Write-Host "Done. Redeploy: scripts/deploy-web-staging-cloudbuild.ps1"
