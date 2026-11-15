# End-to-end check of the semantic grouping and synergy surfaces on staging.
#
# The unit tests cover the ranking rules with injected data. What they cannot
# cover is whether the semantic map and the verified-combo tables are actually
# readable inside the deployed container — a missing artifact makes both
# features return empty quietly rather than failing, so this asserts on real
# populated data from a real deck.
#
# Pass -Email and -BuildId to reuse a deck a previous run already built, which
# skips the ten-minute Professor build.
param(
  [string]$Email,
  [string]$BuildId
)

$ErrorActionPreference = "Stop"
$BASE = "https://buyback-web-staging-rrogeqxyea-uc.a.run.app"
$SLUG = "the-game-lodge"
$stamp = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
$password = "TestPassword123!"
$resuming = $Email -and $BuildId
$email = if ($resuming) { $Email } else { "deck-semantics-e2e-$stamp@example.com" }

function Step($m) { Write-Host "`n=== $m ===" -ForegroundColor Cyan }
function Ok($m)   { Write-Host "  OK   $m" -ForegroundColor Green }
function Bad($m)  { Write-Host "  FAIL $m" -ForegroundColor Red; $script:failures++ }
function Note($m) { Write-Host "  ..   $m" -ForegroundColor DarkGray }
$script:failures = 0

function Invoke-Api {
  param([string]$Method, [string]$Uri, $Body, $Session)
  $req = @{ Uri = $Uri; Method = $Method; ContentType = "application/json"; UseBasicParsing = $true; ErrorAction = "Stop" }
  if ($Body) { $req.Body = $Body }
  if ($Session) { $req.WebSession = $Session }
  try {
    $r = Invoke-WebRequest @req
    return @{ code = [int]$r.StatusCode; body = ($r.Content | ConvertFrom-Json) }
  } catch {
    $code = if ($_.Exception.Response) { [int]$_.Exception.Response.StatusCode } else { 0 }
    $raw = $_.ErrorDetails.Message
    $parsed = $null
    if ($raw) { try { $parsed = $raw | ConvertFrom-Json } catch { } }
    return @{ code = $code; body = $parsed; raw = $raw }
  }
}

# --- session ----------------------------------------------------------------
Step "Session for $email"
if (-not $resuming) {
  $null = Invoke-RestMethod -Uri "$BASE/api/customers" -Method POST -ContentType "application/json" -Body (@{
    firstName = "Deck"; lastName = "Semantics"; email = $email; phone = "5551234567"
    password = $password; storeSlug = $SLUG
  } | ConvertTo-Json)
  Ok "customer created"
}
# Signup does not hand back a session when email verification is on, so log in
# explicitly - the login path does not gate on emailVerified.
$null = Invoke-RestMethod -Uri "$BASE/api/customers/login" -Method POST -ContentType "application/json" -SessionVariable session -Body (@{
  email = $email; password = $password; storeSlug = $SLUG
} | ConvertTo-Json)
$me = Invoke-RestMethod -Uri "$BASE/api/customers/me" -Method GET -WebSession $session
Ok "signed in as $($me.customer.email)"

# --- deck -------------------------------------------------------------------
if ($resuming) {
  $buildId = $BuildId
  Note "reusing build $buildId"
} else {
  Step "Professor build (this takes several minutes)"
  $start = Invoke-RestMethod -Uri "$BASE/api/store/$SLUG/professor/sol-directed-build" -Method POST `
    -ContentType "application/json" -WebSession $session -Body (@{
      start = @{
        commanderName     = "Fynn, the Fangbearer"
        commanderOracleId = ""
        bracket           = 3
        playstyle         = "Grindy value with a poison finish"
        deckTheme         = "deathtouch poison"
        winPreference     = "poison counters"
        commanderStyle    = "lean into what makes this commander unique"
      }
    } | ConvertTo-Json -Depth 6)

  $buildId = $start.job.buildId
  Note "buildId $buildId"

  $deadline = (Get-Date).AddMinutes(25)
  $status = $start.job.status
  while ($status -ne "COMPLETE" -and $status -ne "FAILED" -and (Get-Date) -lt $deadline) {
    Start-Sleep -Seconds 20
    $poll = Invoke-RestMethod -Uri "$BASE/api/store/$SLUG/professor/sol-directed-build?buildId=$buildId" -Method GET -WebSession $session
    if ($poll.job.status -ne $status) { $status = $poll.job.status; Note $status }
  }
  if ($status -ne "COMPLETE") { Bad "build ended as $status"; exit 1 }
  Ok "build complete"
}

# --- semantic facts on the deck response ------------------------------------
Step "Semantic facts on the editable deck"
$r = Invoke-Api GET "$BASE/api/store/$SLUG/professor/deck-editor?buildId=$buildId" $null $session
if ($r.code -ne 200) { Bad "deck GET returned $($r.code): $($r.raw)"; exit 1 }
$cards = $r.body.deck.cards
Ok "deck loaded, $($cards.Count) cards, revision $($r.body.deck.revision)"

$withSemantic = @($cards | Where-Object { $_.semantic })
if ($withSemantic.Count -eq 0) { Bad "no card carried a semantic block at all" }
else { Ok "$($withSemantic.Count)/$($cards.Count) cards carry a semantic block" }

$withRoles = @($cards | Where-Object { $_.semantic.derivedRoles.Count -gt 0 })
if ($withRoles.Count -eq 0) {
  Bad "no card had a derived role - the semantic map is not readable in the container"
} else {
  Ok "$($withRoles.Count) cards have derived roles"
  $sample = $withRoles[0]
  Note "e.g. $($sample.name): $($sample.semantic.derivedRoles -join ', ')"
}

$withActions = @($cards | Where-Object { $_.semantic.topActions.Count -gt 0 })
if ($withActions.Count -eq 0) { Bad "no card had parsed oracle actions" }
else {
  Ok "$($withActions.Count) cards have oracle actions"
  Note "e.g. $($withActions[0].name): $($withActions[0].semantic.topActions -join ', ')"
}

$withCluster = @($cards | Where-Object { $null -ne $_.semantic.clusterId })
if ($withCluster.Count -eq 0) { Bad "no card had a cluster id" } else { Ok "$($withCluster.Count) cards have a cluster id" }

# --- synergy ----------------------------------------------------------------
Step "Synergy index"
$r = Invoke-Api GET "$BASE/api/store/$SLUG/professor/deck-editor/synergy?buildId=$buildId" $null $session
if ($r.code -ne 200) { Bad "synergy GET returned $($r.code): $($r.raw)"; exit 1 }
Ok "synergy responded"

if ($r.body.semanticUnavailable) { Bad "synergy reports the semantic map unavailable" }
else { Ok "synergy sees the semantic map" }

Note "verified combo lines in this deck: $($r.body.comboCount)"

$links = $r.body.linksByCardKey
$keys = @($links.PSObject.Properties.Name)
if ($keys.Count -eq 0) {
  Bad "no card had any synergy partner"
} else {
  Ok "$($keys.Count) cards have at least one synergy partner"
  $kinds = @{}
  foreach ($k in $keys) {
    foreach ($l in $links.$k) { $kinds[$l.kind] = 1 + ($kinds[$l.kind] | ForEach-Object { $_ }) }
  }
  foreach ($kind in $kinds.Keys) { Note "$kind links: $($kinds[$kind])" }

  # The guard that matters: no card should light up most of the deck.
  $worst = 0; $worstKey = ""
  foreach ($k in $keys) { if ($links.$k.Count -gt $worst) { $worst = $links.$k.Count; $worstKey = $k } }
  Note "most-connected card: $worstKey with $worst partners"
  if ($worst -gt [Math]::Floor($cards.Count * 0.5)) {
    Bad "a single card links to over half the deck ($worst) - the highlight would be meaningless"
  } else {
    Ok "most-connected card stays under half the deck ($worst of $($cards.Count))"
  }

  $sampleKey = $keys[0]
  $sampleLink = $links.$sampleKey[0]
  Note "e.g. $sampleKey -> $($sampleLink.name) [$($sampleLink.kind)] $($sampleLink.detail)"
}

# --- summary ----------------------------------------------------------------
Write-Host ""
if ($script:failures -eq 0) {
  Write-Host "ALL CHECKS PASSED" -ForegroundColor Green
  Write-Host "Reuse this deck with: -Email $email -BuildId $buildId" -ForegroundColor DarkGray
} else {
  Write-Host "$($script:failures) CHECK(S) FAILED" -ForegroundColor Red
  Write-Host "Reuse this deck with: -Email $email -BuildId $buildId" -ForegroundColor DarkGray
  exit 1
}
