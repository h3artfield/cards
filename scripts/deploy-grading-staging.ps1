# Deploy grading-service-staging only (OpenCV centering updates)
$ErrorActionPreference = "Stop"
$PROJECT_ID = "trading-card-buyback-dev"
$REGION = "us-central1"
$SERVICE = "grading-service-staging"
$REGISTRY = "us-central1-docker.pkg.dev/trading-card-buyback-dev/buyback"
$REPO_ROOT = Join-Path $PSScriptRoot ".."

Write-Host "==> Cloud Build grading-service-staging"
Push-Location (Join-Path $REPO_ROOT "services\grading-service")
gcloud builds submit . `
  --project=$PROJECT_ID `
  --tag="${REGISTRY}/grading-service-staging:latest"
Pop-Location

Write-Host "==> Deploy $SERVICE"
gcloud run deploy $SERVICE `
  --image="${REGISTRY}/grading-service-staging:latest" `
  --region=$REGION `
  --project=$PROJECT_ID `
  --allow-unauthenticated `
  --port=8001 `
  --memory=512Mi `
  --cpu=1 `
  --quiet

Write-Host "DONE Grading: $(gcloud run services describe $SERVICE --region=$REGION --project=$PROJECT_ID --format='value(status.url)')"
