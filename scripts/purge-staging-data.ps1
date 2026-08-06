# Purge all customer/order data from staging (platform admin only)
param(
  [string]$BaseUrl = "",
  [string]$AdminEmail = "h3artfield@gmail.com",
  [string]$AdminPassword = "Password1"
)

$ErrorActionPreference = "Stop"

if (-not $BaseUrl) {
  $BaseUrl = gcloud run services describe buyback-web-staging `
    --region=us-central1 --project=trading-card-buyback-dev `
    --format="value(status.url)"
}
$BaseUrl = $BaseUrl.TrimEnd("/")
Write-Host "Purging customer data on $BaseUrl ..."

$loginBody = @{ email = $AdminEmail; password = $AdminPassword } | ConvertTo-Json
$loginRes = Invoke-WebRequest -Uri "$BaseUrl/api/admin/login" -Method POST `
  -Body $loginBody -ContentType "application/json" -SessionVariable adminSession -UseBasicParsing
if ($loginRes.StatusCode -ge 400) { throw "Admin login failed" }
Write-Host "Platform admin signed in."

$purgeBody = @{ confirm = "delete" } | ConvertTo-Json
$purgeRes = Invoke-RestMethod -Uri "$BaseUrl/api/admin/purge" -Method POST `
  -Body $purgeBody -ContentType "application/json" -WebSession $adminSession
Write-Host "Purge complete:"
$purgeRes.result | ConvertTo-Json -Depth 5
