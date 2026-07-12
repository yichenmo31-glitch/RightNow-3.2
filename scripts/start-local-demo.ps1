[CmdletBinding()]
param(
  [switch]$SkipDatabaseStart
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$runtimeDir = Join-Path $repoRoot '.work\local-demo'
$statePath = Join-Path $runtimeDir 'processes.json'
$backendDir = Join-Path $repoRoot 'backend'
$frontendDir = Join-Path $repoRoot 'frontend'

New-Item -ItemType Directory -Force -Path $runtimeDir | Out-Null

function Stop-RepoPortProcess([int]$Port) {
  $listener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
    Select-Object -First 1
  if (-not $listener) { return }

  $process = Get-CimInstance Win32_Process -Filter "ProcessId=$($listener.OwningProcess)" -ErrorAction SilentlyContinue
  $commandLine = [string]$process.CommandLine
  $isRepoProcess = $commandLine.IndexOf($repoRoot, [StringComparison]::OrdinalIgnoreCase) -ge 0
  $isKnownBackend = $Port -eq 5000 -and $commandLine -match 'dist[\\/]main\.js'
  if (-not $isRepoProcess -and -not $isKnownBackend) {
    throw "Port $Port is used by a process outside this repository (PID $($listener.OwningProcess))."
  }

  Stop-Process -Id $listener.OwningProcess -Force
  Start-Sleep -Seconds 2
}

function Wait-Http([string]$Url, [int[]]$AllowedStatus, [int]$Attempts = 40) {
  for ($attempt = 1; $attempt -le $Attempts; $attempt++) {
    try {
      $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 3
      if ($AllowedStatus -contains [int]$response.StatusCode) { return }
    } catch {
      $status = $_.Exception.Response.StatusCode.value__
      if ($AllowedStatus -contains [int]$status) { return }
    }
    Start-Sleep -Seconds 1
  }
  throw "Timed out waiting for $Url"
}

if (-not (Test-Path (Join-Path $backendDir '.env'))) {
  throw 'backend/.env is missing. Copy backend/.env.example and configure local values first.'
}

if (-not $SkipDatabaseStart) {
  $postgres = Get-Service -Name 'postgresql-x64-16' -ErrorAction SilentlyContinue
  if ($postgres) {
    if ($postgres.Status -ne 'Running') {
      Start-Service -Name $postgres.Name
      $postgres.WaitForStatus('Running', [TimeSpan]::FromSeconds(20))
    }
  } else {
    & docker compose -f (Join-Path $backendDir 'docker-compose.yml') up -d
    if ($LASTEXITCODE -ne 0) { throw 'Unable to start PostgreSQL with Docker Compose.' }
  }
}

if (-not (Test-Path (Join-Path $backendDir 'dist\main.js'))) {
  throw 'backend/dist is missing. Run npm run build:backend first.'
}
if (-not (Test-Path (Join-Path $frontendDir 'dist\index.html'))) {
  throw 'frontend/dist is missing. Run npm run build:frontend first.'
}

Stop-RepoPortProcess 5000
Stop-RepoPortProcess 5173

$backendOut = Join-Path $runtimeDir 'backend.out.log'
$backendErr = Join-Path $runtimeDir 'backend.err.log'
$frontendOut = Join-Path $runtimeDir 'frontend.out.log'
$frontendErr = Join-Path $runtimeDir 'frontend.err.log'
Remove-Item -LiteralPath $backendOut, $backendErr, $frontendOut, $frontendErr -Force -ErrorAction SilentlyContinue

$backend = Start-Process -FilePath 'node.exe' -ArgumentList 'dist/main.js' `
  -WorkingDirectory $backendDir -RedirectStandardOutput $backendOut `
  -RedirectStandardError $backendErr -WindowStyle Hidden -PassThru
$frontend = Start-Process -FilePath 'npm.cmd' `
  -ArgumentList 'run', 'preview', '--', '--host', '127.0.0.1', '--port', '5173' `
  -WorkingDirectory $frontendDir -RedirectStandardOutput $frontendOut `
  -RedirectStandardError $frontendErr -WindowStyle Hidden -PassThru

$startedAt = Get-Date
@{
  backendPid = $backend.Id
  frontendPid = $frontend.Id
  startedAt = $startedAt.ToString('o')
  repoRoot = $repoRoot
} | ConvertTo-Json | Set-Content -LiteralPath $statePath -Encoding utf8

try {
  Wait-Http 'http://127.0.0.1:5000/api/auth/me' @(401)
  Wait-Http 'http://127.0.0.1:5173/' @(200)
} catch {
  & (Join-Path $PSScriptRoot 'stop-local-demo.ps1')
  throw
}

Write-Host 'RightNow local Demo is ready:'
Write-Host '  Frontend: http://127.0.0.1:5173/'
Write-Host '  Backend:  http://127.0.0.1:5000/api'
Write-Host "  Logs:     $runtimeDir"
