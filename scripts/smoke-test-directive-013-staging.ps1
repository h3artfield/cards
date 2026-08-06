# Directive 013 staging manual checklist (API-level)
# Usage: .\scripts\smoke-test-directive-013-staging.ps1 -BaseUrl "https://buyback-web-staging-....run.app"

param(
  [Parameter(Mandatory = $true)]
  [string]$BaseUrl
)

$ErrorActionPreference = "Stop"
$BaseUrl = $BaseUrl.TrimEnd("/")
$passed = 0
$failed = 0
$notes = @()

function Pass([string]$Msg) {
  $script:passed++
  Write-Host "  [PASS] $Msg" -ForegroundColor Green
}

function Fail([string]$Msg) {
  $script:failed++
  Write-Host "  [FAIL] $Msg" -ForegroundColor Red
}

function Skip([string]$Msg) {
  Write-Host "  [SKIP] $Msg" -ForegroundColor Yellow
  $script:notes += $Msg
}

Write-Host "=== Directive 013 staging checklist: $BaseUrl ===" -ForegroundColor Cyan

# 1. Store page
try {
  $r = Invoke-WebRequest -Uri "$BaseUrl/s/the-game-lodge" -UseBasicParsing -TimeoutSec 60
  if ($r.StatusCode -eq 200) { Pass "Store page /s/the-game-lodge loads" } else { Fail "Store page status $($r.StatusCode)" }
} catch { Fail "Store page: $($_.Exception.Message)" }

# 2. Store API auth flags
try {
  $store = Invoke-RestMethod -Uri "$BaseUrl/api/store/the-game-lodge" -TimeoutSec 30
  if ($store.store.customerGuestModeEnabled -ne $true) {
    Pass "Guest mode disabled on store API"
  } else { Fail "Guest mode should be disabled" }
  if ($store.auth.appleEnabled -eq $false) {
    Pass "Apple auth hidden (appleEnabled=false)"
  } else { Fail "Apple should be disabled on Phase 1" }
  if ($store.auth.googleEnabled -eq $true) {
    Pass "Google auth enabled on store API"
  } else {
    Pass "Google auth disabled on store API (Phase 1 expected if no OAuth creds)"
  }
} catch { Fail "Store API: $($_.Exception.Message)" }

# 3. Customer email signup (no session until verified)
$stamp = Get-Date -Format "yyyyMMddHHmmss"
$testEmail = "d013-staging-$stamp@example.com"
$customerSession = New-Object Microsoft.PowerShell.Commands.WebRequestSession
try {
  $signupBody = @{
    firstName = "D013"
    lastName = "Staging"
    email = $testEmail
    phone = "5550199"
    password = "Password1!"
    storeSlug = "the-game-lodge"
  } | ConvertTo-Json
  $signup = Invoke-WebRequest -Uri "$BaseUrl/api/customers" -Method POST -Body $signupBody -ContentType "application/json" -WebSession $customerSession -UseBasicParsing
  $custData = $signup.Content | ConvertFrom-Json
  if ($custData.customer.id) {
    Pass "Email signup creates customer"
  } else { Fail "Signup missing customer id" }
  if ($custData.requiresVerification -eq $true) {
    Pass "Signup requires verification before session"
  } else { Fail "requiresVerification not set" }
  $hasCookie = $customerSession.Cookies.GetCookies($BaseUrl) | Where-Object { $_.Name -eq "customer_session" }
  if (-not $hasCookie) {
    Pass "No session cookie until email verified"
  } else { Fail "Session cookie set before verification" }
} catch { Fail "Customer signup: $($_.Exception.Message)" }

# 4. Unverified cannot list orders (login required - skip without session)
Skip "Unverified order history gate - requires verified session"

# 5. Unverified logged-in customer cannot create orders
$loginSession = New-Object Microsoft.PowerShell.Commands.WebRequestSession
try {
  $loginBody = @{ email = $testEmail; password = "Password1!" } | ConvertTo-Json
  Invoke-WebRequest -Uri "$BaseUrl/api/customers/login" -Method POST -Body $loginBody -ContentType "application/json" -WebSession $loginSession -UseBasicParsing | Out-Null
  $orderBody = @{ storeSlug = "the-game-lodge" } | ConvertTo-Json
  Invoke-WebRequest -Uri "$BaseUrl/api/orders" -Method POST -Body $orderBody -ContentType "application/json" -WebSession $loginSession -UseBasicParsing -ErrorAction Stop | Out-Null
  Fail "Unverified customer should not create orders"
} catch {
  if ($_.Exception.Response.StatusCode.value__ -eq 403) {
    Pass "Unverified customer blocked from creating orders (403)"
  } else {
    Fail "Order create gate unexpected: $($_.Exception.Message)"
  }
}

# 6. Guest checkout disabled
try {
  $guestBody = @{
    firstName = "Guest"
    lastName = "D013"
    email = "d013-guest-$stamp@example.com"
    phone = "5550188"
    storeSlug = "the-game-lodge"
  } | ConvertTo-Json
  Invoke-WebRequest -Uri "$BaseUrl/api/customers/guest" -Method POST -Body $guestBody -ContentType "application/json" -UseBasicParsing -ErrorAction Stop | Out-Null
  Fail "Guest checkout should be disabled"
} catch {
  if ($_.Exception.Response.StatusCode.value__ -eq 403) {
    Pass "Guest checkout disabled (403)"
  } else {
    Fail "Guest API check: $($_.Exception.Message)"
  }
}

# 7. Customer cannot access another order without session
try {
  Invoke-WebRequest -Uri "$BaseUrl/api/orders/fake-order-id-000" -UseBasicParsing -ErrorAction Stop | Out-Null
  Fail "Unauthenticated order GET should be forbidden"
} catch {
  if ($_.Exception.Response.StatusCode.value__ -in @(403, 401, 404)) {
    Pass "Unauthenticated order GET blocked ($($_.Exception.Response.StatusCode.value__))"
  } else { Fail "Order GET without auth: $($_.Exception.Message)" }
}

# 8. Customer cannot access /admin API
try {
  Invoke-WebRequest -Uri "$BaseUrl/api/admin/orders" -UseBasicParsing -ErrorAction Stop | Out-Null
  Fail "Customer should not access admin orders API"
} catch {
  if ($_.Exception.Response.StatusCode.value__ -eq 401) {
    Pass "Admin orders API requires admin session (401)"
  } else { Fail "Admin API check: $($_.Exception.Message)" }
}

# 9. Store admin login still works
$adminSession = New-Object Microsoft.PowerShell.Commands.WebRequestSession
try {
  $loginBody = @{ email = "lodge1@gmail.com"; password = "Password1"; expectedRole = "store" } | ConvertTo-Json
  $loginRes = Invoke-WebRequest -Uri "$BaseUrl/api/admin/login" -Method POST -Body $loginBody -ContentType "application/json" -WebSession $adminSession -UseBasicParsing
  $loginData = $loginRes.Content | ConvertFrom-Json
  if ($loginData.session.role -eq "store") {
    Pass "Store admin login works (lodge1@gmail.com)"
  } else { Fail "Admin login wrong role" }
  $adminOrders = Invoke-WebRequest -Uri "$BaseUrl/api/admin/orders" -WebSession $adminSession -UseBasicParsing
  if ($adminOrders.StatusCode -eq 200) {
    Pass "Store staff can list store orders"
  } else { Fail "Admin orders list failed" }
} catch { Fail "Admin login: $($_.Exception.Message)" }

# 10. Forgot password neutral response
try {
  $fpBody = @{ email = "nonexistent-$stamp@example.com" } | ConvertTo-Json
  $fp = Invoke-RestMethod -Uri "$BaseUrl/api/customers/forgot-password" -Method POST -Body $fpBody -ContentType "application/json"
  if ($fp.message -match "If an account exists") {
    Pass "Forgot password returns neutral message"
  } else { Fail "Forgot password message unexpected" }
} catch { Fail "Forgot password: $($_.Exception.Message)" }

# 11. Google OAuth endpoint when disabled
try {
  $g = Invoke-WebRequest -Uri "$BaseUrl/api/auth/google?store=the-game-lodge" -MaximumRedirection 0 -UseBasicParsing -ErrorAction Stop
  if ($store.auth.googleEnabled) {
    Pass "Google OAuth redirect available"
  } else {
    Fail "Google should 404 when disabled but returned $($g.StatusCode)"
  }
} catch {
  if ($_.Exception.Response.StatusCode.value__ -eq 404) {
    Pass "Google OAuth returns 404 when disabled (Phase 1)"
  } elseif ($_.Exception.Response.StatusCode.value__ -in @(302, 301)) {
    Pass "Google OAuth redirect (enabled)"
  } else {
    Fail "Google OAuth check: $($_.Exception.Message)"
  }
}

Skip "Email verification link click - manual (check inbox for $testEmail)"
Skip "Stripe signup /checkout - manual regression"
Skip "Ready-for-review email - manual (006W unchanged)"

Write-Host ""
Write-Host "=== Result: $passed passed, $failed failed ===" -ForegroundColor Cyan
if ($notes.Count -gt 0) {
  Write-Host "Manual follow-ups:" -ForegroundColor Yellow
  $notes | ForEach-Object { Write-Host "  - $_" }
}
if ($failed -gt 0) { exit 1 }
