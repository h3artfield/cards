# API-level E2E: customer signup, card upload (Storage), order submit (OpenAI)
param(
  [Parameter(Mandatory = $true)]
  [string]$BaseUrl
)

$ErrorActionPreference = "Stop"
$BaseUrl = $BaseUrl.TrimEnd("/")

function Fail([string]$Msg) { Write-Host "FAIL: $Msg" -ForegroundColor Red; exit 1 }
function Pass([string]$Msg) { Write-Host "OK: $Msg" -ForegroundColor Green }

# 1x1 red PNG
$pngB64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
$dataUrl = "data:image/png;base64,$pngB64"

Write-Host "=== E2E API test: $BaseUrl ==="

$email = "e2e-$(Get-Date -Format 'yyyyMMddHHmmss')@example.com"
$custBody = @{
  firstName = "E2E"; lastName = "Test"; email = $email
  phone = "5550199"; password = "Password1"; storeSlug = "the-game-lodge"
} | ConvertTo-Json

$custRes = Invoke-RestMethod -Uri "$BaseUrl/api/customers" -Method POST -Body $custBody -ContentType "application/json" -SessionVariable session
$customerId = $custRes.customer.id
Pass "Customer created $customerId"

$orderBody = @{ customerId = $customerId } | ConvertTo-Json
$orderRes = Invoke-RestMethod -Uri "$BaseUrl/api/orders" -Method POST -Body $orderBody -ContentType "application/json" -WebSession $session
$orderId = $orderRes.order.id
Pass "Order created $($orderRes.order.orderNumber)"

$cardBody = @{
  orderId = $orderId
  itemType = "raw"
  frontImageUrl = $dataUrl
  backImageUrl = $dataUrl
} | ConvertTo-Json -Depth 5

$cardRes = Invoke-RestMethod -Uri "$BaseUrl/api/cards" -Method POST -Body $cardBody -ContentType "application/json" -WebSession $session
$card = $cardRes.card
if ($card.frontImageUrl -like "*firebasestorage.googleapis.com*") {
  Pass "Front image in Firebase Storage"
} elseif ($card.frontImageUrl -like "data:*") {
  Fail "Front image still inline data URL (Storage upload failed)"
} else {
  Pass "Front image URL: $($card.frontImageUrl.Substring(0, [Math]::Min(80, $card.frontImageUrl.Length)))..."
}

if ($card.backImageUrl -like "*firebasestorage.googleapis.com*") {
  Pass "Back image in Firebase Storage"
} else {
  Fail "Back image not in Storage"
}

Write-Host "Submitting order (OpenAI identification)..."
try {
  $submitRes = Invoke-RestMethod -Uri "$BaseUrl/api/orders/$orderId/submit" -Method POST -ContentType "application/json" -WebSession $session -TimeoutSec 300
  $order = $submitRes.order
  Pass "Order submitted, status=$($order.status)"
} catch {
  $errBody = $_.ErrorDetails.Message
  Fail "Order submit failed: $errBody"
}

$cardsRes = Invoke-RestMethod -Uri "$BaseUrl/api/orders/$orderId" -WebSession $session
$updatedCard = $cardsRes.cards | Select-Object -First 1
if ($updatedCard.detectedName -or $updatedCard.category) {
  Pass "AI identification ran (detectedName=$($updatedCard.detectedName), category=$($updatedCard.category))"
} else {
  Fail "AI identification did not populate card fields (status=$($updatedCard.status))"
}

$loginBody = @{ email = "lodge1@gmail.com"; password = "Password1" } | ConvertTo-Json
$adminRes = Invoke-RestMethod -Uri "$BaseUrl/api/admin/login" -Method POST -Body $loginBody -ContentType "application/json" -SessionVariable adminSession
Pass "Admin login OK"

$adminOrders = Invoke-RestMethod -Uri "$BaseUrl/api/admin/orders" -WebSession $adminSession
$found = $adminOrders.orders | Where-Object { $_.id -eq $orderId }
if ($found) { Pass "Admin can see order $($orderRes.order.orderNumber)" } else { Fail "Admin order list missing new order" }

Write-Host "=== E2E API test passed ==="
