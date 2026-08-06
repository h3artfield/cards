# Deploy buyback-web-staging via Cloud Build with immutable git-SHA image tag.
# Does NOT use local Docker Desktop.
# Usage:
#   .\scripts\deploy-web-staging-immutable.ps1
#   .\scripts\deploy-web-staging-immutable.ps1 -AllowDirty   # development-only override

param(
  [switch]$AllowDirty
)

$ErrorActionPreference = "Stop"

$PROJECT_ID = "trading-card-buyback-dev"
$REGION = "us-central1"
$REPO = "buyback"
$WEB_SERVICE = "buyback-web-staging"
$REGISTRY = "$REGION-docker.pkg.dev/$PROJECT_ID/$REPO"
$ENV_FILE = Join-Path $PSScriptRoot "..\web\.env.local"
$APP_URL = "https://buyback-web-staging-rrogeqxyea-uc.a.run.app"

function Get-EnvValue([string]$Name) {
  if (-not (Test-Path $ENV_FILE)) { return $null }
  foreach ($line in Get-Content $ENV_FILE) {
    if ($line -match "^\s*$Name=(.*)$") {
      $val = $Matches[1].Trim()
      if ($val.StartsWith('"') -and $val.EndsWith('"')) { $val = $val.Substring(1, $val.Length - 2) }
      return $val
    }
  }
  return $null
}

Push-Location (Join-Path $PSScriptRoot "..")
try {
  $porcelainRaw = git status --porcelain
  $porcelain = if ($null -eq $porcelainRaw) { "" } else { "$porcelainRaw".Trim() }
  if ($porcelain -and -not $AllowDirty) {
    throw @"
Working tree is dirty — commit all intended changes before deploy.
Uncommitted changes:
$porcelain

Use -AllowDirty only for explicit development-only builds.
"@
  }

  $GIT_SHA = (git rev-parse HEAD).Trim()
  if (-not $GIT_SHA) { throw "Could not resolve git commit SHA" }

  $GIT_TREE = (git rev-parse "HEAD^{tree}").Trim()
  $BUILD_CONTEXT_HASH = "${GIT_SHA}:${GIT_TREE}"
  $GIT_TREE_STATE = if ($porcelain) { "dirty" } else { "clean" }

  $SIMPLE_CLERK_VERSION = "2026-08-06-commander-eligibility-v2-golden-catalog"
  $EVALUATION_SUITE_VERSION = "115-case-v2-structured-grading"
  $GOLDEN_CATALOG_VERSION = "golden-catalog-v1"
  $COMMANDER_ELIGIBILITY_VERSION = "commander-eligibility-v2"
  $RULINGS_IMPORTER_VERSION = "scryfall-rulings-bulk-v1"
  $ACTIVE_RULINGS_DATASET_VERSION = "rulings-3a5a7c58c42a68f2"
  $DEPLOYED_AT = (Get-Date).ToUniversalTime().ToString("o")
  $IMAGE_TAG = $GIT_SHA
  $IMAGE_REF = "${REGISTRY}/buyback-web-staging:${IMAGE_TAG}"

  Write-Host "==> Git commit SHA: $GIT_SHA"
  Write-Host "==> Git tree state: $GIT_TREE_STATE"
  Write-Host "==> Build context hash: $BUILD_CONTEXT_HASH"
  Write-Host "==> Image tag: $IMAGE_TAG"

  $allowDirtyFlag = if ($AllowDirty) { "true" } else { "false" }
  $subs = @(
    "_GIT_COMMIT_SHA=$GIT_SHA"
    "_GIT_TREE_STATE=$GIT_TREE_STATE"
    "_BUILD_CONTEXT_HASH=$BUILD_CONTEXT_HASH"
    "_ALLOW_DIRTY_BUILD=$allowDirtyFlag"
    "_DEPLOYED_AT=$DEPLOYED_AT"
    "_SIMPLE_CLERK_VERSION=$SIMPLE_CLERK_VERSION"
    "_EVALUATION_SUITE_VERSION=$EVALUATION_SUITE_VERSION"
    "_GOLDEN_CATALOG_VERSION=$GOLDEN_CATALOG_VERSION"
    "_COMMANDER_ELIGIBILITY_VERSION=$COMMANDER_ELIGIBILITY_VERSION"
    "_APP_URL=$APP_URL"
    "_FB_API_KEY=$(Get-EnvValue 'NEXT_PUBLIC_FIREBASE_API_KEY')"
    "_FB_AUTH_DOMAIN=$(Get-EnvValue 'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN')"
    "_FB_PROJECT_ID=$(Get-EnvValue 'NEXT_PUBLIC_FIREBASE_PROJECT_ID')"
    "_FB_BUCKET=$(Get-EnvValue 'NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET')"
    "_FB_SENDER=$(Get-EnvValue 'NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID')"
    "_FB_APP_ID=$(Get-EnvValue 'NEXT_PUBLIC_FIREBASE_APP_ID')"
  ) -join ","

  Write-Host "==> Cloud Build submit"
  $BUILD_ID = (gcloud builds submit . `
    --config=scripts/cloudbuild-web-staging-immutable.yaml `
    --substitutions=$subs `
    --project=$PROJECT_ID `
    --format="value(id)").Trim()
  if (-not $BUILD_ID) { throw "Cloud Build did not return a build ID" }
  Write-Host "==> Cloud Build ID: $BUILD_ID"

  Write-Host "==> Resolve image digest for $IMAGE_REF"
  $DIGEST = (gcloud artifacts docker images describe $IMAGE_REF `
    --project=$PROJECT_ID `
    --format="value(image_summary.digest)")
  if (-not $DIGEST) { throw "Could not resolve image digest for $IMAGE_REF" }
  Write-Host "==> Image digest: $DIGEST"

  $IMAGE_AT_DIGEST = "${REGISTRY}/buyback-web-staging@${DIGEST}"

  $GRADING_URL = (gcloud run services describe grading-service-staging `
    --region=$REGION `
    --project=$PROJECT_ID `
    --format="value(status.url)" 2>$null)
  if (-not $GRADING_URL) { $GRADING_URL = "https://grading-service-staging-rrogeqxyea-uc.a.run.app" }

  $envFile = Join-Path $env:TEMP "buyback-web-staging-immutable-env.yaml"
  @"
FIREBASE_PROJECT_ID: trading-card-buyback-dev
NEXT_PUBLIC_FIREBASE_PROJECT_ID: trading-card-buyback-dev
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: $(Get-EnvValue 'NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET')
GRADING_SERVICE_URL: $GRADING_URL
REQUIRE_FIRESTORE: "true"
APP_URL: $APP_URL
NEXT_PUBLIC_APP_URL: $APP_URL
GIT_COMMIT_SHA: "$GIT_SHA"
GIT_TREE_STATE: "$GIT_TREE_STATE"
BUILD_CONTEXT_HASH: "$BUILD_CONTEXT_HASH"
CLOUD_BUILD_ID: "$BUILD_ID"
DEPLOYED_AT: "$DEPLOYED_AT"
SIMPLE_CLERK_VERSION: "$SIMPLE_CLERK_VERSION"
EVALUATION_SUITE_VERSION: "$EVALUATION_SUITE_VERSION"
GOLDEN_CATALOG_VERSION: "$GOLDEN_CATALOG_VERSION"
COMMANDER_ELIGIBILITY_VERSION: "$COMMANDER_ELIGIBILITY_VERSION"
RULINGS_IMPORTER_VERSION: "$RULINGS_IMPORTER_VERSION"
ACTIVE_RULINGS_DATASET_VERSION: "$ACTIVE_RULINGS_DATASET_VERSION"
IMAGE_DIGEST: "$DIGEST"
"@ | Set-Content -Path $envFile -Encoding utf8

  $secretNames = @("OPENAI_API_KEY", "ADMIN_SESSION_SECRET", "POKEMON_TCG_API_KEY", "PRICECHARTING_API_KEY")
  $secretFlags = @()
  foreach ($name in $secretNames) {
    $exists = $false
    gcloud secrets describe $name --project=$PROJECT_ID 2>$null | Out-Null
    if ($LASTEXITCODE -eq 0) { $secretFlags += "${name}=${name}:latest" }
  }
  $secretArg = ($secretFlags -join ",")

  Write-Host "==> Deploy Cloud Run with immutable digest"
  $deployArgs = @(
    "run", "deploy", $WEB_SERVICE,
    "--image=$IMAGE_AT_DIGEST",
    "--region=$REGION",
    "--project=$PROJECT_ID",
    "--platform=managed",
    "--allow-unauthenticated",
    "--port=8080",
    "--memory=1Gi",
    "--cpu=1",
    "--timeout=300",
    "--min-instances=0",
    "--max-instances=10",
    "--env-vars-file=$envFile",
    "--quiet"
  )
  if ($secretArg) {
    $deployArgs += "--set-secrets=$secretArg"
  }
  gcloud @deployArgs
  if ($LASTEXITCODE -ne 0) { throw "Cloud Run deploy failed" }

  $REVISION = (gcloud run services describe $WEB_SERVICE `
    --region=$REGION `
    --project=$PROJECT_ID `
    --format="value(status.latestReadyRevisionName)")
  Write-Host "==> Cloud Run revision: $REVISION"

  $lock = @{
    gitCommitSha = $GIT_SHA
    gitTreeState = $GIT_TREE_STATE
    buildContextHash = $BUILD_CONTEXT_HASH
    imageTag = $IMAGE_TAG
    imageDigest = $DIGEST
    buildId = $BUILD_ID
    cloudRunRevision = $REVISION
    deployedAt = $DEPLOYED_AT
    simpleClerkVersion = $SIMPLE_CLERK_VERSION
    evaluationSuiteVersion = $EVALUATION_SUITE_VERSION
    goldenCatalogVersion = $GOLDEN_CATALOG_VERSION
    commanderEligibilityVersion = $COMMANDER_ELIGIBILITY_VERSION
    rulingsImporterVersion = $RULINGS_IMPORTER_VERSION
    activeRulingsDatasetVersion = $ACTIVE_RULINGS_DATASET_VERSION
    stagingUrl = $APP_URL
  }
  $lockPath = Join-Path $PSScriptRoot "..\web\scripts\.staging-deployment-lock.json"
  [System.IO.File]::WriteAllText($lockPath, ($lock | ConvertTo-Json -Depth 4) + "`n", (New-Object System.Text.UTF8Encoding $false))

  Write-Host ""
  Write-Host "=== IMMUTABLE STAGING DEPLOY COMPLETE ==="
  Write-Host "gitCommitSha:                $GIT_SHA"
  Write-Host "gitTreeState:                $GIT_TREE_STATE"
  Write-Host "buildContextHash:            $BUILD_CONTEXT_HASH"
  Write-Host "imageTag:                    $IMAGE_TAG"
  Write-Host "imageDigest:                 $DIGEST"
  Write-Host "cloudBuildId:                $BUILD_ID"
  Write-Host "cloudRunRevision:            $REVISION"
  Write-Host "deployedAt:                  $DEPLOYED_AT"
  Write-Host "simpleClerkVersion:          $SIMPLE_CLERK_VERSION"
  Write-Host "goldenCatalogVersion:        $GOLDEN_CATALOG_VERSION"
  Write-Host "commanderEligibilityVersion: $COMMANDER_ELIGIBILITY_VERSION"
  Write-Host "evaluationSuite:             $EVALUATION_SUITE_VERSION"
  Write-Host "URL:                         $APP_URL"
  Write-Host "Lock file:                   $lockPath"
}
finally {
  Pop-Location
}
