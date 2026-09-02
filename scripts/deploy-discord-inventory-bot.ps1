# Deploy the Discord inventory listener as an always-on Cloud Run service.
# Usage: .\scripts\deploy-discord-inventory-bot.ps1
$ErrorActionPreference = "Stop"
$REPO_ROOT = Split-Path -Parent $PSScriptRoot
$PROJECT_ID = "trading-card-buyback-dev"
$REGION = "us-central1"
$SERVICE = "discord-inventory-bot"
$IMAGE = "us-central1-docker.pkg.dev/$PROJECT_ID/buyback/discord-inventory-bot:latest"
$ENV_FILE = Join-Path $REPO_ROOT "web\.env.local"

function Get-EnvValue([string]$Name) {
  if (-not (Test-Path $ENV_FILE)) { return "" }
  foreach ($line in Get-Content $ENV_FILE) {
    if ($line -match "^\s*$Name=(.*)$") {
      $val = $Matches[1].Trim()
      if ($val.StartsWith('"') -and $val.EndsWith('"')) { $val = $val.Substring(1, $val.Length - 2) }
      if ($val.StartsWith("'") -and $val.EndsWith("'")) { $val = $val.Substring(1, $val.Length - 2) }
      return $val.Trim().TrimStart([char]0xFEFF)
    }
  }
  return ""
}

function Ensure-Secret([string]$Name, [string]$Value) {
  if (-not $Value) { return $false }
  $tmp = Join-Path $env:TEMP "$Name.secret.txt"
  [System.IO.File]::WriteAllText($tmp, $Value)
  try {
    $prevEap = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    gcloud secrets describe $Name --project=$PROJECT_ID 2>$null | Out-Null
    $exists = $LASTEXITCODE -eq 0
    $ErrorActionPreference = $prevEap
    if ($exists) {
      Write-Host "Updating secret $Name..."
      gcloud secrets versions add $Name --project=$PROJECT_ID --data-file=$tmp --quiet
    } else {
      Write-Host "Creating secret $Name..."
      gcloud secrets create $Name --project=$PROJECT_ID --data-file=$tmp --quiet
    }
  } finally {
    Remove-Item $tmp -Force -ErrorAction SilentlyContinue
  }
  return $true
}

$token = Get-EnvValue "DISCORD_BOT_TOKEN"
$guildId = Get-EnvValue "DISCORD_GUILD_ID"
$channelId = Get-EnvValue "DISCORD_CHANNEL_ID"
$storeSlug = Get-EnvValue "DISCORD_STORE_SLUG"
if (-not $token) { throw "DISCORD_BOT_TOKEN missing from web/.env.local" }
if (-not $channelId) { throw "DISCORD_CHANNEL_ID missing from web/.env.local" }
if (-not $storeSlug) { throw "DISCORD_STORE_SLUG missing from web/.env.local" }

$fbProjectId = Get-EnvValue "FIREBASE_PROJECT_ID"
if (-not $fbProjectId) { $fbProjectId = Get-EnvValue "NEXT_PUBLIC_FIREBASE_PROJECT_ID" }
if (-not $fbProjectId) { $fbProjectId = $PROJECT_ID }
$fbBucket = Get-EnvValue "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET"
if (-not $fbBucket) { $fbBucket = "$fbProjectId.appspot.com" }

Write-Host "==> Sync Discord bot token to Secret Manager"
gcloud services enable secretmanager.googleapis.com --project=$PROJECT_ID --quiet
[void](Ensure-Secret "DISCORD_BOT_TOKEN" $token)

$PROJECT_NUMBER = gcloud projects describe $PROJECT_ID --format="value(projectNumber)"
$RUN_SA = "$PROJECT_NUMBER-compute@developer.gserviceaccount.com"
gcloud secrets add-iam-policy-binding DISCORD_BOT_TOKEN `
  --project=$PROJECT_ID `
  --member="serviceAccount:$RUN_SA" `
  --role="roles/secretmanager.secretAccessor" `
  --quiet | Out-Null

$secretFlags = @("DISCORD_BOT_TOKEN=DISCORD_BOT_TOKEN:latest")
foreach ($name in @("OPENAI_API_KEY")) {
  $prevEap = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  gcloud secrets describe $name --project=$PROJECT_ID 2>$null | Out-Null
  $exists = $LASTEXITCODE -eq 0
  $ErrorActionPreference = $prevEap
  if ($exists) { $secretFlags += "${name}=${name}:latest" }
}

Write-Host "==> Cloud Build $SERVICE"
Push-Location $REPO_ROOT
try {
  gcloud builds submit . `
    --config=scripts/cloudbuild-discord-inventory-bot.yaml `
    --project=$PROJECT_ID `
    --quiet
  if ($LASTEXITCODE -ne 0) { throw "Cloud Build failed" }
} finally {
  Pop-Location
}

$envPath = Join-Path $env:TEMP "discord-inventory-bot-env.yaml"
@"
REQUIRE_FIRESTORE: "true"
FIREBASE_PROJECT_ID: "$fbProjectId"
NEXT_PUBLIC_FIREBASE_PROJECT_ID: "$fbProjectId"
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: "$fbBucket"
APP_URL: "https://cardscanner9000.com"
NEXT_PUBLIC_APP_URL: "https://cardscanner9000.com"
DISCORD_GUILD_ID: "$guildId"
DISCORD_CHANNEL_ID: "$channelId"
DISCORD_STORE_SLUG: "$storeSlug"
MTG_RAG_ENABLED: "true"
"@ | Set-Content -Path $envPath -Encoding utf8

$secretMount = $secretFlags -join ","
Write-Host "==> Deploy Cloud Run $SERVICE (min 1, max 1, CPU always on)"
gcloud run deploy $SERVICE `
  --image=$IMAGE `
  --region=$REGION `
  --project=$PROJECT_ID `
  --no-allow-unauthenticated `
  --port=8080 `
  --memory=1Gi `
  --cpu=1 `
  --min-instances=1 `
  --max-instances=1 `
  --timeout=300 `
  --no-cpu-throttling `
  --set-secrets=$secretMount `
  --env-vars-file=$envPath `
  --quiet

if ($LASTEXITCODE -ne 0) { throw "Cloud Run deploy failed" }

gcloud projects add-iam-policy-binding $PROJECT_ID `
  --member="serviceAccount:$RUN_SA" `
  --role="roles/datastore.user" `
  --quiet | Out-Null

Write-Host "DONE $SERVICE is live. Stop any local npm run discord:inventory-bot so only Cloud Run holds the Discord session."
