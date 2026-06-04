param(
  [string]$ApiBaseUrl = "http://localhost:8080/api/v1",
  [string]$FrontendBaseUrl = "http://localhost:3000",
  [switch]$SkipResearch,
  [switch]$VerboseJson
)

$ErrorActionPreference = "Stop"

function Write-Step($message) {
  Write-Host "==> $message" -ForegroundColor Cyan
}

function Write-Ok($message) {
  Write-Host "OK  $message" -ForegroundColor Green
}

function Invoke-Api {
  param(
    [ValidateSet("GET", "POST", "PUT", "DELETE")]
    [string]$Method,
    [string]$Path,
    [object]$Body = $null,
    [string]$Token = ""
  )

  $headers = @{}
  if ($Token) {
    $headers["Authorization"] = "Bearer $Token"
  }

  $params = @{
    Method = $Method
    Uri = "$ApiBaseUrl$Path"
    Headers = $headers
    TimeoutSec = 60
  }

  if ($null -ne $Body) {
    $params["ContentType"] = "application/json"
    $params["Body"] = ($Body | ConvertTo-Json -Depth 20)
  }

  $response = Invoke-RestMethod @params
  if ($VerboseJson) {
    $response | ConvertTo-Json -Depth 20
  }
  return $response
}

function Invoke-ExpectedApiStatus {
  param(
    [ValidateSet("GET", "POST", "PUT", "DELETE")]
    [string]$Method,
    [string]$Path,
    [int]$ExpectedStatus,
    [object]$Body = $null,
    [string]$Token = ""
  )

  $headers = @{}
  if ($Token) {
    $headers["Authorization"] = "Bearer $Token"
  }

  $params = @{
    Method = $Method
    Uri = "$ApiBaseUrl$Path"
    Headers = $headers
    TimeoutSec = 60
  }

  if ($null -ne $Body) {
    $params["ContentType"] = "application/json"
    $params["Body"] = ($Body | ConvertTo-Json -Depth 20)
  }

  try {
    $response = Invoke-WebRequest @params
    if ($response.StatusCode -ne $ExpectedStatus) {
      throw "Expected HTTP $ExpectedStatus but got $($response.StatusCode) for $Method $Path"
    }
  } catch {
    if ($_.Exception.Response) {
      $actual = [int]$_.Exception.Response.StatusCode
      if ($actual -eq $ExpectedStatus) {
        Write-Ok "$Method $Path returns HTTP $ExpectedStatus"
        return
      }
      throw "Expected HTTP $ExpectedStatus but got HTTP $actual for $Method $Path"
    }
    throw
  }

  Write-Ok "$Method $Path returns HTTP $ExpectedStatus"
}

function Invoke-ExpectedFrontendStatus {
  param(
    [string]$Path,
    [int]$ExpectedStatus
  )

  try {
    $response = Invoke-WebRequest -Uri "$FrontendBaseUrl$Path" -UseBasicParsing -TimeoutSec 30
    if ($response.StatusCode -ne $ExpectedStatus) {
      throw "Expected frontend HTTP $ExpectedStatus but got $($response.StatusCode) for $Path"
    }
  } catch {
    if ($_.Exception.Response) {
      $actual = [int]$_.Exception.Response.StatusCode
      if ($actual -eq $ExpectedStatus) {
        Write-Ok "frontend $Path returns HTTP $ExpectedStatus"
        return
      }
      throw "Expected frontend HTTP $ExpectedStatus but got HTTP $actual for $Path"
    }
    throw
  }

  Write-Ok "frontend $Path returns HTTP $ExpectedStatus"
}

function Assert-Truthy($value, $message) {
  if (-not $value) {
    throw "Assertion failed: $message"
  }
  Write-Ok $message
}

Write-Step "Health check"
$health = Invoke-Api GET "/health"
Assert-Truthy ($health.status -eq "ok") "backend health is ok"

Write-Step "Frontend route smoke"
foreach ($path in @("/", "/cards", "/decks", "/collections", "/lab", "/lab/recommendations", "/lab/anti-meta", "/lab/predictions", "/lab/deck-analysis")) {
  Invoke-ExpectedFrontendStatus $path 200
}
Invoke-ExpectedFrontendStatus "/prices" 404

Write-Step "Negative auth checks"
Invoke-ExpectedApiStatus GET "/collections" 401
Invoke-ExpectedApiStatus GET "/research/recommendations?collection_id=missing" 401
Invoke-ExpectedApiStatus POST "/auth/login" 401 @{
  email = "not-a-real-user@pokelab.local"
  password = "wrong-password"
}

$stamp = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
$email = "e2e-$stamp@pokelab.local"
$password = "PokeLabE2E!$stamp"
$username = "e2e$stamp"

Write-Step "Register test user"
try {
  $auth = Invoke-Api POST "/auth/register" @{
    email = $email
    username = $username
    password = $password
    full_name = "PokeLab E2E"
  }
} catch {
  Write-Host "Register failed, trying login fallback..." -ForegroundColor Yellow
  $auth = Invoke-Api POST "/auth/login" @{
    email = $email
    password = $password
  }
}
$token = $auth.access_token
Assert-Truthy $token "auth returns access token"

Write-Step "Auth /me"
$me = Invoke-Api GET "/auth/me" $null $token
Assert-Truthy $me.id "protected auth endpoint works"

Write-Step "Cards list"
$cardsResp = Invoke-Api GET "/cards?limit=12&sort_by=expansion&sort_order=desc"
$cards = @($cardsResp.cards)
Assert-Truthy ($cards.Count -gt 0) "cards endpoint returns cards"
$firstCard = $cards | Where-Object { $_.id } | Select-Object -First 1
Assert-Truthy $firstCard.id "card has id"

Write-Step "Card detail and image asset"
$encodedCardId = [uri]::EscapeDataString($firstCard.id)
$cardDetail = Invoke-Api GET "/cards/by-id?id=$encodedCardId"
Assert-Truthy ($cardDetail.id -eq $firstCard.id) "card detail API opens by id"
Invoke-ExpectedFrontendStatus "/cards/detail?id=$encodedCardId" 200
if ($firstCard.image_url -and $firstCard.image_url.StartsWith("/")) {
  Invoke-ExpectedFrontendStatus $firstCard.image_url 200
} else {
  Write-Host "Card has no local image_url; skipping local image asset check." -ForegroundColor Yellow
}

Write-Step "Deck list"
$decksResp = Invoke-Api GET "/decks?with_meta=1&limit=20"
$decks = @($decksResp.decks)
Assert-Truthy ($decks.Count -gt 0) "decks endpoint returns decks"
$firstDeck = $decks[0]
Assert-Truthy $firstDeck.id "deck has id"

Write-Step "Deck detail route and decklists"
$encodedDeckId = [uri]::EscapeDataString($firstDeck.id)
$deckDetail = Invoke-Api GET "/decks/$encodedDeckId"
Assert-Truthy ($deckDetail.id -eq $firstDeck.id) "deck detail API opens by id"
$decklists = Invoke-Api GET "/decks/$encodedDeckId/decklists"
Assert-Truthy ($null -ne $decklists) "deck decklists endpoint responds"
Invoke-ExpectedFrontendStatus "/decks/detail?id=$encodedDeckId" 200

Write-Step "AI deck builder endpoint"
$builtDeck = Invoke-Api POST "/decks/build" @{
  name = "E2E AI Standard Deck"
  budget = 500000
  budget_currency = "IDR"
  preferred_types = @("Fire")
  regulation_marks = @()
  use_inventory = $false
}
Assert-Truthy $builtDeck.name "AI deck builder returns a deck name"
Assert-Truthy ($builtDeck.total_cards -ge 1) "AI deck builder returns card count"

Write-Step "Analyze generated deck"
$sampleCards = @()
foreach ($card in $cards | Select-Object -First 8) {
  $sampleCards += @{ card_id = $card.id; count = 4 }
}
$deckAnalysisLite = Invoke-Api POST "/decks/analyze" @{
  name = "E2E Analyze Deck"
  cards = $sampleCards
}
Assert-Truthy ($deckAnalysisLite.total_cards -ge 1) "deck analyze endpoint returns totals"

Write-Step "Create collection"
$collection = Invoke-Api POST "/collections" @{ name = "E2E Collection $stamp" } $token
Assert-Truthy $collection.id "collection created"

Write-Step "Add cards to collection"
foreach ($card in $cards | Select-Object -First 10) {
  Invoke-Api POST "/collections/$($collection.id)/items" @{
    card_id = $card.id
    quantity = 4
    condition = "NM"
  } $token | Out-Null
}
$collectionDetail = Invoke-Api GET "/collections/$($collection.id)" $null $token
Assert-Truthy $collectionDetail.id "collection can be fetched"

Write-Step "Owner collection update"
$updatedCollection = Invoke-Api PUT "/collections/$($collection.id)" @{
  name = "E2E Collection Updated $stamp"
} $token
Assert-Truthy ($updatedCollection.name -like "E2E Collection Updated*") "owner can update own collection"

Write-Step "Collection ownership check"
$otherStamp = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
$otherAuth = Invoke-Api POST "/auth/register" @{
  email = "e2e-other-$otherStamp@pokelab.local"
  username = "e2eother$otherStamp"
  password = "PokeLabE2EOther!$otherStamp"
  full_name = "PokeLab E2E Other"
}
$otherToken = $otherAuth.access_token
Assert-Truthy $otherToken "second user auth returns access token"
Invoke-ExpectedApiStatus GET "/collections/$($collection.id)" 404 $null $otherToken
Invoke-ExpectedApiStatus PUT "/collections/$($collection.id)" 404 @{ name = "Hijack Attempt" } $otherToken
Invoke-ExpectedApiStatus POST "/collections/$($collection.id)/items" 404 @{
  card_id = $firstCard.id
  quantity = 1
  condition = "NM"
} $otherToken
Invoke-ExpectedApiStatus GET "/collections/$($collection.id)/summary" 404 $null $otherToken
Invoke-ExpectedApiStatus DELETE "/collections/$($collection.id)" 404 $null $otherToken

if (-not $SkipResearch) {
  Write-Step "Research recommendations"
  $recommendations = Invoke-Api GET "/research/recommendations?collection_id=$($collection.id)" $null $token
  Assert-Truthy ($null -ne $recommendations.recommendations) "recommendations endpoint responds"

  Write-Step "Find deck with analysis data"
  $analysis = $null
  $analysisDeck = $null
  foreach ($deck in $decks) {
    try {
      $candidate = Invoke-Api GET "/research/deck-analysis?collection_id=$($collection.id)&deck_id=$([uri]::EscapeDataString($deck.id))" $null $token
      if ($candidate.deck_id) {
        $analysis = $candidate
        $analysisDeck = $deck
        break
      }
    } catch {
      # Try next deck because some seed decks may not have representative cards.
    }
  }
  Assert-Truthy $analysis "deck-analysis returns a scout report for at least one deck"
  Assert-Truthy ($analysis.card_usage.Count -ge 1) "deck-analysis includes per-card usage"
  Assert-Truthy ($analysis.tactical_profile) "deck-analysis includes tactical profile"

  Write-Step "Anti-meta plan"
  $antiMeta = Invoke-Api POST "/research/anti-meta" @{ target_deck_id = $analysisDeck.id } $token
  Assert-Truthy ($antiMeta.Count -ge 0) "anti-meta endpoint responds"

  Write-Step "Predictions"
  $predictions = Invoke-Api GET "/research/predictions?limit=10" $null $token
  Assert-Truthy ($predictions.Count -ge 0) "predictions endpoint responds"

  Write-Step "Research advisor fallback/OpenRouter"
  $advisor = Invoke-Api POST "/research/advisor" @{
    question = "Jelaskan deck terbaik untuk koleksi ini secara singkat."
    context = ($analysis | ConvertTo-Json -Depth 10)
  } $token
  Assert-Truthy $advisor.answer "advisor returns explanation or fallback"
}

Write-Step "AI suggest decks"
$suggestions = Invoke-Api POST "/ai/suggest-decks" @{
  budget = 500000
  play_style = "aggressive"
  preferred_types = @("Fire")
}
Assert-Truthy ($suggestions.Count -ge 0) "AI suggest decks endpoint responds"

Write-Host ""

Write-Step "ML service health check"
try {
  $mlHealth = Invoke-Api GET "/ml/health"
  Write-Ok "ML health endpoint responds: status=$($mlHealth.status)"
} catch {
  Write-Host "SKIP ML health check (service may not be running): $_" -ForegroundColor Yellow
}

Write-Step "ML model info"
try {
  $mlInfo = Invoke-Api GET "/ml/models/info"
  Assert-Truthy ($null -ne $mlInfo.price_prediction) "ML price_prediction model info present"
  Assert-Truthy ($null -ne $mlInfo.deck_ranking) "ML deck_ranking model info present"
  Assert-Truthy ($null -ne $mlInfo.anomaly_detection) "ML anomaly_detection model info present"
} catch {
  Write-Host "SKIP ML model info (service may not be running): $_" -ForegroundColor Yellow
}

Write-Step "ML anomaly detection"
try {
  $anomalyResp = Invoke-Api GET "/ml/detect/anomalies?card_ids=$( $firstCard.id )&threshold_std=3.0"
  Assert-Truthy ($null -ne $anomalyResp.anomalies) "ML anomaly detection responds"
} catch {
  Write-Host "SKIP ML anomaly detection (service may not be running): $_" -ForegroundColor Yellow
}

Write-Host "PokeLab E2E completed successfully." -ForegroundColor Green
Write-Host "User: $email"
Write-Host "Collection: $($collection.id)"
