# Smoke test for Cloud Run staging
# Usage: .\scripts\smoke-test-staging.ps1 -BaseUrl "https://buyback-web-staging-....run.app"

param(
  [Parameter(Mandatory = $true)]
  [string]$BaseUrl
)

$ErrorActionPreference = "Stop"
$BaseUrl = $BaseUrl.TrimEnd("/")

function Test-Endpoint([string]$Name, [string]$Url, [int[]]$Ok = @(200)) {
  Write-Host "  $Name ... " -NoNewline
  try {
    $r = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 60
    if ($Ok -contains $r.StatusCode) {
      Write-Host "OK ($($r.StatusCode))"
      return $true
    }
    Write-Host "FAIL ($($r.StatusCode))"
    return $false
  } catch {
    Write-Host "FAIL ($($_.Exception.Message))"
    return $false
  }
}

Write-Host "=== Smoke test: $BaseUrl ==="

$results = @()
$results += Test-Endpoint "Health (firestore)" "$BaseUrl/api/health/firestore"
$results += Test-Endpoint "Store page" "$BaseUrl/s/the-game-lodge"
$results += Test-Endpoint "Admin login" "$BaseUrl/admin/login"
$results += Test-Endpoint "Store API" "$BaseUrl/api/store/the-game-lodge"

# Grading via web env — hit health if we know grading URL from env
$gradingUrl = $env:GRADING_SERVICE_URL
if ($gradingUrl) {
  $results += Test-Endpoint "Grading health" "$gradingUrl/health"
}

# Create customer account (verification required before order)
Write-Host "  Customer signup ... " -NoNewline
$customerBody = @{
  firstName = "Smoke"
  lastName = "Test"
  email = "smoke-test-$(Get-Date -Format 'yyyyMMddHHmmss')@example.com"
  phone = "5550100"
  password = "Password1"
  storeSlug = "the-game-lodge"
} | ConvertTo-Json

try {
  $custRes = Invoke-WebRequest -Uri "$BaseUrl/api/customers" -Method POST -Body $customerBody -ContentType "application/json" -UseBasicParsing -SessionVariable session
  $customer = ($custRes.Content | ConvertFrom-Json).customer
  if (-not $customer.id) { throw "No customer id" }
  $requiresVerify = ($custRes.Content | ConvertFrom-Json).requiresVerification
  if ($requiresVerify) {
    Write-Host "OK (signup requires verification)"
    $results += $true
  } else {
    $orderBody = @{ storeSlug = "the-game-lodge" } | ConvertTo-Json
    $orderRes = Invoke-WebRequest -Uri "$BaseUrl/api/orders" -Method POST -Body $orderBody -ContentType "application/json" -WebSession $session -UseBasicParsing
    $order = ($orderRes.Content | ConvertFrom-Json).order
    if (-not $order.id) { throw "No order id" }
    Write-Host "OK (customer $($customer.id), order $($order.orderNumber))"
    $results += $true
  }
} catch {
  Write-Host "FAIL ($($_.Exception.Message))"
  $results += $false
}

# Admin login
Write-Host "  Admin login ... " -NoNewline
try {
  $loginBody = @{ email = "lodge1@gmail.com"; password = "Password1" } | ConvertTo-Json
  $loginRes = Invoke-WebRequest -Uri "$BaseUrl/api/admin/login" -Method POST -Body $loginBody -ContentType "application/json" -UseBasicParsing -SessionVariable adminSession
  $loginData = $loginRes.Content | ConvertFrom-Json
  if (-not $loginData.session) { throw "No admin session" }
  Write-Host "OK"
  $results += $true

  Write-Host "  Admin orders list ... " -NoNewline
  $ordersRes = Invoke-WebRequest -Uri "$BaseUrl/api/admin/orders" -WebSession $adminSession -UseBasicParsing
  Write-Host "OK ($($ordersRes.StatusCode))"
  $results += $true
} catch {
  Write-Host "FAIL ($($_.Exception.Message))"
  $results += $false
  $results += $false
}

$passed = ($results | Where-Object { $_ }).Count
$total = $results.Count
Write-Host ""
Write-Host "=== Result: $passed / $total passed ==="
if ($passed -lt $total) { exit 1 }
