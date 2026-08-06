# Build buyback-web Docker image locally (no secrets in image)
param(
  [string]$AppUrl = "https://placeholder.run.app",
  [string]$Tag = "buyback-web-staging:local"
)

$ErrorActionPreference = "Stop"
$EnvFile = Join-Path $PSScriptRoot "..\web\.env.local"
$WebDir = Join-Path $PSScriptRoot "..\web"

function Get-EnvValue([string]$Name) {
  if (-not (Test-Path $EnvFile)) { return "" }
  foreach ($line in Get-Content $EnvFile) {
    if ($line -match "^$Name=(.*)$") {
      return $Matches[1].Trim()
    }
  }
  return ""
}

Set-Location $WebDir
docker build `
  --build-arg "NEXT_PUBLIC_FIREBASE_API_KEY=$(Get-EnvValue 'NEXT_PUBLIC_FIREBASE_API_KEY')" `
  --build-arg "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=$(Get-EnvValue 'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN')" `
  --build-arg "NEXT_PUBLIC_FIREBASE_PROJECT_ID=$(Get-EnvValue 'NEXT_PUBLIC_FIREBASE_PROJECT_ID')" `
  --build-arg "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=$(Get-EnvValue 'NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET')" `
  --build-arg "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=$(Get-EnvValue 'NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID')" `
  --build-arg "NEXT_PUBLIC_FIREBASE_APP_ID=$(Get-EnvValue 'NEXT_PUBLIC_FIREBASE_APP_ID')" `
  --build-arg "NEXT_PUBLIC_APP_URL=$AppUrl" `
  -t $Tag .

Write-Host "Built $Tag"
