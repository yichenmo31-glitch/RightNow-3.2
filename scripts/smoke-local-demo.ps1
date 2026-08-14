[CmdletBinding()]
param(
  [string]$Email = 'test7@qq.com',
  [string]$Password = '123456',
  [switch]$IncludeImageEdit
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$apiBase = 'http://127.0.0.1:5001/api'
$results = [System.Collections.Generic.List[string]]::new()

function Pass([string]$Name) {
  $results.Add($Name)
  Write-Host "PASS  $Name" -ForegroundColor Green
}

function Unwrap($Response) {
  if ($null -ne $Response.success -and $null -ne $Response.data) { return $Response.data }
  return $Response
}

$frontend = Invoke-WebRequest -Uri 'http://127.0.0.1:5173/' -UseBasicParsing -TimeoutSec 10
if ($frontend.StatusCode -ne 200) { throw 'Frontend did not return HTTP 200.' }
Pass 'frontend HTTP entry'

$advisorSource = Get-Content -Raw -LiteralPath (Join-Path $repoRoot 'frontend\components\FloatingAdvisor.tsx')
$appSource = Get-Content -Raw -LiteralPath (Join-Path $repoRoot 'frontend\App.tsx')
if ($advisorSource -notmatch 'aria-label="打开小爪教练对话"' -or
    $advisorSource -notmatch 'if \(!wasDragged\) openChat\(\)' -or
    $appSource -notmatch 'onChatClick=\{\(\) =>') {
  throw 'The Xiaozhua-to-chat navigation contract is missing.'
}
Pass 'Xiaozhua chat-entry contract'

$loginRaw = Invoke-RestMethod -Method Post -Uri "$apiBase/auth/login" `
  -ContentType 'application/json' -Body (@{ email = $Email; password = $Password } | ConvertTo-Json)
$login = Unwrap $loginRaw
$token = $login.access_token
if (-not $token) { throw 'Demo login did not return an access token.' }
$headers = @{ Authorization = "Bearer $token" }
Pass 'Demo login'

$chatRaw = Invoke-RestMethod -Method Post -Uri "$apiBase/chat" -Headers $headers `
  -ContentType 'application/json' -Body (@{ content = '今天什么安排？请用一句话回复本地冒烟测试。' } | ConvertTo-Json) `
  -TimeoutSec 120
$chat = Unwrap $chatRaw
if (-not ([string]$chat.content).Trim()) { throw 'Chat reply content is empty.' }
Pass 'Coach chat reply'

$today = Get-Date -Format 'yyyy-MM-dd'
$todosRaw = Invoke-RestMethod -Uri "$apiBase/todos?date=$today" -Headers $headers -TimeoutSec 30
if ($todosRaw.success -ne $true -or -not ($todosRaw.PSObject.Properties.Name -contains 'data')) {
  throw 'TODO response is invalid.'
}
Pass 'TODO read'

$dietRaw = Invoke-RestMethod -Uri "$apiBase/diet?date=$today" -Headers $headers -TimeoutSec 30
if ($dietRaw.success -ne $true -or -not ($dietRaw.PSObject.Properties.Name -contains 'data')) {
  throw 'Diet response is invalid.'
}
Pass 'Diet read'

$trainingRaw = Invoke-RestMethod -Uri "$apiBase/training" -Headers $headers -TimeoutSec 30
if ($trainingRaw.success -ne $true -or -not ($trainingRaw.PSObject.Properties.Name -contains 'data')) {
  throw 'Training response is invalid.'
}
Pass 'Training read'

if ($IncludeImageEdit) {
  $fixturePath = Join-Path $repoRoot 'frontend\public\assets\ori.png'
  if (-not (Test-Path -LiteralPath $fixturePath)) { throw 'Image-edit fixture is missing.' }
  $image = 'data:image/png;base64,' + [Convert]::ToBase64String([IO.File]::ReadAllBytes($fixturePath))

  $imageRaw = Invoke-RestMethod -Method Post -Uri "$apiBase/image-gen/ideal-body" -Headers $headers `
    -ContentType 'application/json' -Body (@{
      prompt = 'Preserve the exact same person, face, skin tone, body shape, pose, background and lighting. Change only the shorts color to navy blue.'
      currentImageBase64 = $image
      size = '1024x1024'
    } | ConvertTo-Json) -TimeoutSec 180
  $imageResult = Unwrap $imageRaw
  if (-not ([string]$imageResult.image).Trim()) { throw 'Image edit did not return an image.' }
  Pass 'Real provider image edit'
} else {
  Write-Host 'SKIP  Real provider image edit (run with -IncludeImageEdit to consume one real request)' -ForegroundColor Yellow
}

Write-Host "Local Demo smoke completed: $($results.Count) checks passed."
