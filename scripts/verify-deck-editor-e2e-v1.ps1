# End-to-end check of the editable-deck API against staging.
#
# Builds a real deck with the Professor, hands it to the editor, then drives the
# edit surface: park a card, add one, mark it, hit a revision conflict, and
# revert. Verifies against the live catalog rather than fixtures, which is the
# part the unit tests cannot cover.

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
$email = if ($resuming) { $Email } else { "deck-editor-e2e-$stamp@example.com" }

function Step($msg) { Write-Host "`n=== $msg ===" -ForegroundColor Cyan }
function Ok($msg)   { Write-Host "  OK   $msg" -ForegroundColor Green }
function Bad($msg)  { Write-Host "  FAIL $msg" -ForegroundColor Red; $script:failures++ }
$script:failures = 0

# PowerShell truncates $_.ErrorDetails.Message at 64KB, and a 409 carries the
# whole deck, so error bodies are read off the response stream instead.
function Invoke-Api {
  param([string]$Method, [string]$Uri, $Body, $Session)
  # Not $args — that is an automatic variable and assigning to it is an error.
  $req = @{ Uri = $Uri; Method = $Method; ContentType = "application/json"; UseBasicParsing = $true; ErrorAction = "Stop" }
  if ($Body) { $req.Body = $Body }
  if ($Session) { $req.WebSession = $Session }
  try {
    $r = Invoke-WebRequest @req
    return @{ code = [int]$r.StatusCode; body = ($r.Content | ConvertFrom-Json) }
  } catch {
    $resp = $_.Exception.Response
    if (-not $resp) { throw }
    # Invoke-WebRequest has already drained the response stream by the time the
    # exception surfaces, so ErrorDetails is the only place the body survives.
    # It is capped at 64KB, which a 409 carrying a whole deck exceeds, so
    # callers on that path assert against $raw rather than parsed JSON.
    $raw = $_.ErrorDetails.Message
    $parsed = $null
    if ($raw) { try { $parsed = $raw | ConvertFrom-Json } catch { } }
    return @{ code = [int]$resp.StatusCode; body = $parsed; raw = $raw }
  }
}

# ---------------------------------------------------------------------------
Step $(if ($resuming) { "Sign in as $email" } else { "Create a customer and sign in" })

if (-not $resuming) {
  $null = Invoke-RestMethod -Uri "$BASE/api/customers" -Method POST -ContentType "application/json" -Body (@{
    firstName = "Deck"; lastName = "Editor"; email = $email; phone = "5551234567"
    password = $password; storeSlug = $SLUG
  } | ConvertTo-Json)
}

# Signup does not hand back a session when email verification is on, so log in
# explicitly — the login path does not gate on emailVerified.
$null = Invoke-RestMethod -Uri "$BASE/api/customers/login" -Method POST -ContentType "application/json" -SessionVariable session -Body (@{
  email = $email; password = $password; storeSlug = $SLUG
} | ConvertTo-Json)

$me = Invoke-RestMethod -Uri "$BASE/api/customers/me" -Method GET -WebSession $session
Ok "signed in as $($me.customer.email)"

# ---------------------------------------------------------------------------
if ($resuming) {
  $buildId = $BuildId
  Step "Reusing build $buildId"
  # A resumed run starts from an edited deck, so put it back to the Professor's
  # list first. The marker has to go too: revert deliberately keeps user
  # markers, so without this the run's createMarker is a correct duplicate
  # rejection rather than the clean insert the checks below expect.
  $null = Invoke-Api -Method PATCH -Uri "$BASE/api/store/$SLUG/professor/deck-editor" -Session $session -Body (@{
    buildId = $buildId
    ops = @(
      @{ op = "revertToBaseline" },
      @{ op = "deleteMarker"; markerId = "d:need-to-buy" }
    )
  } | ConvertTo-Json -Depth 6)
} else {
  Step "Build a deck with the Professor (this takes several minutes)"

  $start = Invoke-RestMethod -Uri "$BASE/api/store/$SLUG/professor/sol-directed-build" -Method POST -ContentType "application/json" -WebSession $session -Body (@{
    start = @{
      commanderName = "Fynn, the Fangbearer"
      commanderOracleId = ""
      bracket = 3
      playstyle = "Grindy value with a poison finish"
      deckTheme = "deathtouch poison"
      winPreference = "poison counters"
      commanderStyle = "lean into what makes this commander unique"
    }
  } | ConvertTo-Json -Depth 6)

  $buildId = $start.job.buildId
  Write-Host "  buildId $buildId"

  $deadline = (Get-Date).AddMinutes(25)
  $status = $start.job.status
  while ($status -ne "COMPLETE" -and $status -ne "FAILED" -and (Get-Date) -lt $deadline) {
    Start-Sleep -Seconds 20
    $poll = Invoke-RestMethod -Uri "$BASE/api/store/$SLUG/professor/sol-directed-build?buildId=$buildId" -Method GET -WebSession $session
    if ($poll.job.status -ne $status) {
      $status = $poll.job.status
      Write-Host "  $status"
    }
  }

  if ($status -ne "COMPLETE") { Bad "build ended as $status"; exit 1 }
  Ok "build complete"
}

# ---------------------------------------------------------------------------
Step "GET the editable deck (first open hands the sealed build over)"

$editorUrl = "$BASE/api/store/$SLUG/professor/deck-editor"
$open = Invoke-RestMethod -Uri "$editorUrl`?buildId=$buildId" -Method GET -WebSession $session

$deck = $open.deck
$mainboard = @($deck.cards | Where-Object { $_.board -eq "mainboard" })
$landCount = @($mainboard | Where-Object { $_.isLand }).Count
$landsWithIds = @($mainboard | Where-Object { $_.isLand -and $_.oracleId }).Count
$withRationale = @($mainboard | Where-Object { $_.professor }).Count

Write-Host "  mainboard        $($open.legality.mainboardLibraryCount) cards"
Write-Host "  lands            $landCount ($landsWithIds with oracle ids)"
Write-Host "  with rationale   $withRationale"
Write-Host "  commander legal  $($open.legality.commanderLegal)"
Write-Host "  professor deck   $(if ($open.legality.professorEndorsed) { 'endorsed' } else { 'edited' })"
Write-Host "  unresolved       $($open.legality.unresolvedCardKeys.Count)"
Write-Host "  marker facets    $($open.markerFacets.Count)"

if ($open.legality.mainboardLibraryCount -eq 99) { Ok "the deck is 99 cards" } else { Bad "mainboard is $($open.legality.mainboardLibraryCount), expected 99" }
if ($open.legality.commanderLegal) { Ok "legal in Commander" } else { Bad "reported illegal on first open: $($open.legality.violations | ConvertTo-Json -Compress)" }
if ($open.legality.professorEndorsed) { Ok "endorsed by the Professor" } else { Bad "a fresh handoff must be endorsed" }
if ($open.legality.unresolvedCardKeys.Count -eq 0) { Ok "every card resolved against the catalog" } else { Bad "unresolved: $($open.legality.unresolvedCardKeys -join ', ')" }
if ($landsWithIds -eq $landCount) { Ok "every land got an oracle id from the catalog" } else { Bad "$($landCount - $landsWithIds) land(s) fell back to a name key" }

# A resumed run inherits whatever revision the previous run left behind, so the
# checks below track the live value instead of assuming a fresh deck.
$rev = $deck.revision
Write-Host "  revision         $rev"
if ($resuming -or $rev -eq 0) { Ok "revision read as $rev" } else { Bad "a fresh deck should start at revision 0, got $rev" }

$facetKinds = ($open.markerFacets | ForEach-Object { $_.kind } | Sort-Object -Unique) -join ", "
Write-Host "  facet kinds      $facetKinds"

# The same GET again must return the stored deck, not build a second one.
$reopen = Invoke-Api -Method GET -Uri "$editorUrl`?buildId=$buildId" -Session $session
if ($reopen.body.deck.revision -eq $rev -and $reopen.body.deck.deckId -eq $deck.deckId) { Ok "reopening returns the same deck" } else { Bad "reopen produced a different deck" }

# ---------------------------------------------------------------------------
Step "PATCH: park a card, add a replacement, mark it"

$victim = @($mainboard | Where-Object { -not $_.isLand -and $_.professor.structuralNecessity -eq "FLEX" })[0]
if (-not $victim) { $victim = @($mainboard | Where-Object { -not $_.isLand })[0] }
Write-Host "  parking          $($victim.name)"

$patchCall = Invoke-Api -Method PATCH -Uri $editorUrl -Session $session -Body (@{
  buildId = $buildId
  expectedRevision = $rev
  ops = @(
    @{ op = "moveCard"; cardKey = $victim.cardKey; board = "considering" },
    @{ op = "addCard"; oracleId = $null; name = "Snake Umbra"; board = "mainboard" },
    @{ op = "createMarker"; label = "Need to buy"; scope = "deck" },
    @{ op = "assignMarker"; cardKey = $victim.cardKey; markerId = "d:need-to-buy" }
  )
} | ConvertTo-Json -Depth 6)

if ($patchCall.code -ne 200) { Bad "PATCH returned $($patchCall.code): $($patchCall.body.error)"; exit 1 }
$patch = $patchCall.body

Write-Host "  applied          $($patch.applied), rejected $($patch.rejected.Count)"
Write-Host "  revision         $($patch.deck.revision)"
Write-Host "  mainboard        $($patch.legality.mainboardLibraryCount)"
Write-Host "  commander legal  $($patch.legality.commanderLegal)"
Write-Host "  professor deck   $(if ($patch.legality.professorEndorsed) { 'endorsed' } else { 'edited' })"

if ($patch.applied -eq 4) { Ok "all four operations applied" } else { Bad "applied $($patch.applied)/4: $($patch.rejected | ConvertTo-Json -Compress)" }
if ($patch.deck.revision -eq ($rev + 1)) { Ok "revision advanced $rev -> $($patch.deck.revision)" } else { Bad "revision is $($patch.deck.revision), expected $($rev + 1)" }
if ($patch.legality.mainboardLibraryCount -eq 99) { Ok "still 99 after a one-for-one swap" } else { Bad "mainboard is $($patch.legality.mainboardLibraryCount)" }
if ($patch.legality.commanderLegal) { Ok "still legal" } else { Bad "the swap made it illegal: $($patch.legality.violations | ConvertTo-Json -Compress)" }
if (-not $patch.legality.professorEndorsed) { Ok "no longer endorsed, which is correct after an edit" } else { Bad "an edited deck must not read as endorsed" }

$parked = @($patch.deck.cards | Where-Object { $_.cardKey -eq $victim.cardKey })[0]
if ($parked.board -eq "considering" -and $parked.professor) { Ok "the parked card kept its Professor rationale" } else { Bad "the parked card lost its rationale" }

$added = @($patch.deck.cards | Where-Object { $_.name -eq "Snake Umbra" })[0]
$addedMarkers = ($added.derivedMarkers | ForEach-Object { $_.kind }) -join ", "
if ($addedMarkers -match "user_added") { Ok "the added card is flagged as a user addition ($addedMarkers)" } else { Bad "the added card is not flagged: $addedMarkers" }

# ---------------------------------------------------------------------------
Step "PATCH: a stale revision must be refused"

# $rev is now one behind, which is exactly the situation a second open tab is in.
$conflict = Invoke-Api -Method PATCH -Uri $editorUrl -Session $session -Body (@{
  buildId = $buildId
  expectedRevision = $rev
  ops = @(@{ op = "renameDeck"; deckName = "Should not apply" })
} | ConvertTo-Json -Depth 6)

if ($conflict.code -eq 409 -and $conflict.raw -match '"conflict":true' -and $conflict.raw -match '"deck":\{') {
  Ok "409 with the current deck attached, so the client can resync in one trip"
  Write-Host "  conflict body    at least $([math]::Round($conflict.raw.Length / 1024, 1)) KB (truncated by PowerShell)"
} else {
  Bad "expected 409 with a conflict payload, got $($conflict.code): $($conflict.raw)"
}

$after = Invoke-Api -Method GET -Uri "$editorUrl`?buildId=$buildId" -Session $session
if ($after.body.deck.deckName -ne "Should not apply") { Ok "the refused rename did not land" } else { Bad "a refused edit was applied anyway" }

# ---------------------------------------------------------------------------
Step "PATCH: an illegal edit is stored but reported"

$illegalCall = Invoke-Api -Method PATCH -Uri $editorUrl -Session $session -Body (@{
  buildId = $buildId
  expectedRevision = $patch.deck.revision
  ops = @(@{ op = "addCard"; oracleId = $null; name = "Rhystic Study"; board = "mainboard" })
} | ConvertTo-Json -Depth 6)
if ($illegalCall.code -ne 200) { Bad "PATCH returned $($illegalCall.code): $($illegalCall.body.error)"; exit 1 }
$illegal = $illegalCall.body

$colorViolation = @($illegal.legality.violations | Where-Object { $_.kind -eq "color_identity" })[0]
if ($colorViolation) { Ok "off-colour card caught: $($colorViolation.message)" } else { Bad "an off-colour card was not reported" }
if (-not $illegal.legality.commanderLegal) { Ok "the deck reads as illegal" } else { Bad "the deck still reads as legal" }
if (@($illegal.deck.cards | Where-Object { $_.name -eq "Rhystic Study" }).Count -eq 1) { Ok "the edit was stored anyway, so no work is lost" } else { Bad "the edit was discarded" }

# ---------------------------------------------------------------------------
Step "PATCH: a malformed operation is refused outright"

$malformed = Invoke-Api -Method PATCH -Uri $editorUrl -Session $session -Body (@{
  buildId = $buildId
  ops = @(@{ op = "moveCard"; cardKey = "o:whatever"; board = "sideboard" })
} | ConvertTo-Json -Depth 6)
if ($malformed.code -eq 400) { Ok "400 on an unknown board: $($malformed.body.error)" } else { Bad "expected 400, got $($malformed.code)" }

# Hand-written JSON, because ConvertTo-Json would turn the string "4" back into
# a number and defeat the point of the check.
$stringCopiesBody = "{""buildId"":""$buildId"",""ops"":[{""op"":""setCopies"",""cardKey"":""o:whatever"",""copies"":""4""}]}"
$stringCopies = Invoke-Api -Method PATCH -Uri $editorUrl -Session $session -Body $stringCopiesBody
if ($stringCopies.code -eq 400) { Ok "400 on a string copy count: $($stringCopies.body.error)" } else { Bad "expected 400, got $($stringCopies.code)" }

# ---------------------------------------------------------------------------
Step "PATCH: revert restores the Professor's deck"

$revertCall = Invoke-Api -Method PATCH -Uri $editorUrl -Session $session -Body (@{
  buildId = $buildId
  ops = @(@{ op = "revertToBaseline" })
} | ConvertTo-Json -Depth 6)
if ($revertCall.code -ne 200) { Bad "PATCH returned $($revertCall.code): $($revertCall.body.error)"; exit 1 }
$revert = $revertCall.body

Write-Host "  mainboard        $($revert.legality.mainboardLibraryCount)"
Write-Host "  professor deck   $(if ($revert.legality.professorEndorsed) { 'endorsed' } else { 'edited' })"

if ($revert.legality.professorEndorsed) { Ok "the Professor's deck is back" } else { Bad "revert did not restore endorsement" }
if ($revert.legality.commanderLegal) { Ok "legal again" } else { Bad "still illegal after revert" }
if (@($revert.deck.cards | Where-Object { $_.name -eq "Rhystic Study" }).Count -eq 0) { Ok "the off-colour card is gone" } else { Bad "the off-colour card survived the revert" }
if (@($revert.deck.markers | Where-Object { $_.id -eq "d:need-to-buy" }).Count -eq 1) { Ok "the user's own marker survived, as it should" } else { Bad "revert wrongly deleted a user marker" }

# ---------------------------------------------------------------------------
Step "Someone else's deck must not be reachable"

$otherEmail = "deck-editor-e2e-other-$stamp@example.com"
$null = Invoke-RestMethod -Uri "$BASE/api/customers" -Method POST -ContentType "application/json" -Body (@{
  firstName = "Other"; lastName = "Person"; email = $otherEmail; phone = "5559876543"
  password = $password; storeSlug = $SLUG
} | ConvertTo-Json)
$null = Invoke-RestMethod -Uri "$BASE/api/customers/login" -Method POST -ContentType "application/json" -SessionVariable other -Body (@{
  email = $otherEmail; password = $password; storeSlug = $SLUG
} | ConvertTo-Json)

$peekGet = Invoke-Api -Method GET -Uri "$editorUrl`?buildId=$buildId" -Session $other
if ($peekGet.code -eq 404) { Ok "404 for a deck the caller does not own" } else { Bad "expected 404, got $($peekGet.code)" }

$peekPatch = Invoke-Api -Method PATCH -Uri $editorUrl -Session $other -Body (@{
  deckId = $deck.deckId
  ops = @(@{ op = "renameDeck"; deckName = "Hijacked" })
} | ConvertTo-Json -Depth 6)
if ($peekPatch.code -eq 404) { Ok "404 on a PATCH against someone else's deck" } else { Bad "expected 404, got $($peekPatch.code)" }

$notHijacked = Invoke-Api -Method GET -Uri "$editorUrl`?buildId=$buildId" -Session $session
if ($notHijacked.body.deck.deckName -ne "Hijacked") { Ok "the deck name is untouched" } else { Bad "another customer renamed the deck" }

# ---------------------------------------------------------------------------
Write-Host ""
if ($script:failures -eq 0) {
  Write-Host "ALL CHECKS PASSED  (buildId $buildId)" -ForegroundColor Green
  exit 0
} else {
  Write-Host "$($script:failures) CHECK(S) FAILED  (buildId $buildId)" -ForegroundColor Red
  exit 1
}
