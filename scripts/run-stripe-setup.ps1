# Run full Stripe bootstrap: product/price/webhook -> .env.local -> GCP secrets -> deploy
$ErrorActionPreference = "Stop"
$Root = Split-Path $PSScriptRoot -Parent
$EnvFile = Join-Path $Root "web\.env.local"

if (-not (Test-Path $EnvFile)) { throw "Missing web/.env.local" }

$hasKey = $false
foreach ($line in Get-Content $EnvFile) {
  if ($line -match '^\s*STRIPE_SECRET_KEY=(.+)$' -and $Matches[1].Trim().Length -gt 10) {
    $hasKey = $true
    break
  }
}
if (-not $hasKey) {
  throw "STRIPE_SECRET_KEY not found in web/.env.local - save the file (Ctrl+S) and retry."
}

Write-Host "==> Stripe product + price + webhook"
Push-Location (Join-Path $Root "web")
npx tsx scripts/setup-stripe-store-plan.ts
Pop-Location

Write-Host ""
Write-Host "==> Sync secrets to GCP"
& (Join-Path $PSScriptRoot "sync-stripe-secrets.ps1")

Write-Host ""
Write-Host "==> Deploy staging"
& (Join-Path $PSScriptRoot "deploy-web-staging-cloudbuild.ps1")

Write-Host ""
Write-Host "DONE - test signup at /signup with card 4242 4242 4242 4242"
