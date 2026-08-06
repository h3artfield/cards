# Cloudflare Email Routing setup for cardscanner9000.com
# Forwards billing@, admin@, support@ → h3artfield@gmail.com
#
# Prerequisites:
#   1. Cloudflare API token with:
#      - Zone → Email Routing → Edit
#      - Zone → DNS → Read (and Edit if enabling routing adds records)
#   2. Create token: https://dash.cloudflare.com/profile/api-tokens
#
# Usage:
#   $env:CLOUDFLARE_API_TOKEN = "your_token"
#   powershell -ExecutionPolicy Bypass -File scripts/setup-cloudflare-email-routing.ps1
#
# Dry run (list DNS + plan only, no changes):
#   powershell -ExecutionPolicy Bypass -File scripts/setup-cloudflare-email-routing.ps1 -DryRun

param(
    [string]$Domain = "cardscanner9000.com",
    [string]$ForwardTo = "h3artfield@gmail.com",
    [string[]]$Addresses = @("billing", "admin", "support"),
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"

$token = $env:CLOUDFLARE_API_TOKEN
if (-not $token) {
    throw "Set CLOUDFLARE_API_TOKEN before running this script."
}

$headers = @{
    Authorization = "Bearer $token"
    "Content-Type"  = "application/json"
}

function Invoke-CfApi {
    param([string]$Method, [string]$Uri, [object]$Body = $null)
    $params = @{ Method = $Method; Uri = $Uri; Headers = $headers }
    if ($Body) { $params.Body = ($Body | ConvertTo-Json -Depth 10) }
    $resp = Invoke-RestMethod @params
    if (-not $resp.success) {
        throw "Cloudflare API error: $($resp.errors | ConvertTo-Json -Compress)"
    }
    return $resp.result
}

Write-Host "==> Resolving zone ID for $Domain"
$zones = Invoke-CfApi -Method GET -Uri "https://api.cloudflare.com/client/v4/zones?name=$Domain"
if (-not $zones -or $zones.Count -eq 0) { throw "Zone not found for $Domain" }
$zoneId = $zones[0].id
Write-Host "    Zone ID: $zoneId"

Write-Host "`n==> Current DNS (email-related)"
$records = Invoke-CfApi -Method GET -Uri "https://api.cloudflare.com/client/v4/zones/$zoneId/dns_records?per_page=100"
$resendRelated = $records | Where-Object {
    $_.type -in @("MX", "TXT") -and (
        $_.name -eq $Domain -or
        $_.name -like "*send*" -or
        $_.name -like "*resend*" -or
        $_.name -like "*_dmarc*"
    )
}
foreach ($r in $resendRelated) {
    Write-Host ("  {0,-40} {1,-4} {2}" -f $r.name, $r.type, $r.content)
}

Write-Host "`n==> Email Routing status"
$routing = Invoke-CfApi -Method GET -Uri "https://api.cloudflare.com/client/v4/zones/$zoneId/email/routing"
Write-Host "    Enabled: $($routing.enabled)"
Write-Host "    Status:  $($routing.status)"

Write-Host "`n==> Planned DNS changes (Email Routing enablement)"
Write-Host @"
Cloudflare Email Routing typically adds ONLY if not present:
  MX  @  route1.mx.cloudflare.net (prio 73)
  MX  @  route2.mx.cloudflare.net (prio 41)
  MX  @  route3.mx.cloudflare.net (prio 12)
  TXT @  v=spf1 include:_spf.mx.cloudflare.net ~all

Resend records on send.* / resend._domainkey / _dmarc are on OTHER names — should stay untouched.
If apex already has v=spf1, Cloudflare may ask to MERGE include:_spf.mx.cloudflare.net (do NOT add a second SPF TXT).
"@

if ($DryRun) {
    Write-Host "`n[DRY RUN] No changes applied."
    exit 0
}

if (-not $routing.enabled) {
    Write-Host "`n==> Enabling Email Routing DNS..."
    try {
        Invoke-CfApi -Method POST -Uri "https://api.cloudflare.com/client/v4/zones/$zoneId/email/routing/dns"
        Write-Host "    Email Routing DNS enabled."
    } catch {
        Write-Host "    Enable via dashboard if API fails: Email → Email Routing → Enable"
        throw
    }
}

Write-Host "`n==> Destination address (Gmail)"
$destinations = Invoke-CfApi -Method GET -Uri "https://api.cloudflare.com/client/v4/accounts/$((Invoke-CfApi -Method GET -Uri "https://api.cloudflare.com/client/v4/accounts").id)/email/routing/addresses" 2>$null
# Destination addresses are account-level; create via routing rules API

Write-Host "`n==> Creating forwarding rules"
foreach ($local in $Addresses) {
    $customAddress = "$local@$Domain"
    Write-Host "    $customAddress → $ForwardTo"

    # Create custom address if needed
    try {
        Invoke-CfApi -Method POST -Uri "https://api.cloudflare.com/client/v4/zones/$zoneId/email/routing/addresses" -Body @{
            email = $customAddress
        }
        Write-Host "      Custom address created."
    } catch {
        Write-Host "      Custom address may already exist (continuing)."
    }

    # Create catch-all style rule for this address
    $rules = Invoke-CfApi -Method GET -Uri "https://api.cloudflare.com/client/v4/zones/$zoneId/email/routing/rules"
    $existing = $rules | Where-Object { $_.matchers -and ($_.matchers | Where-Object { $_.field -eq "to" -and $_.value -eq $customAddress }) }
    if ($existing) {
        Write-Host "      Rule already exists."
        continue
    }

    Invoke-CfApi -Method POST -Uri "https://api.cloudflare.com/client/v4/zones/$zoneId/email/routing/rules" -Body @{
        name = "Forward $local to Gmail"
        enabled = $true
        matchers = @(@{ type = "literal"; field = "to"; value = $customAddress })
        actions = @(@{ type = "forward"; value = @($ForwardTo) })
    }
    Write-Host "      Forwarding rule created."
}

Write-Host "`n==> Post-setup DNS (email-related)"
$recordsAfter = Invoke-CfApi -Method GET -Uri "https://api.cloudflare.com/client/v4/zones/$zoneId/dns_records?per_page=100"
$resendAfter = $recordsAfter | Where-Object {
    $_.type -in @("MX", "TXT") -and (
        $_.name -eq $Domain -or
        $_.name -like "*send*" -or
        $_.name -like "*resend*" -or
        $_.name -like "*_dmarc*"
    )
}
foreach ($r in $resendAfter) {
    Write-Host ("  {0,-40} {1,-4} {2}" -f $r.name, $r.type, $r.content)
}

Write-Host @"

DONE. Next steps:
  1. Check Gmail for Cloudflare/Gmail verification if prompted — click verify.
  2. Send test emails to billing@, admin@, support@$Domain
  3. Confirm they arrive at $ForwardTo

Resend sending (send.$Domain SPF, resend._domainkey, _dmarc) should be unchanged.
Use billing@$Domain as Stripe account contact email.
"@
