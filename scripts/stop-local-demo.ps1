[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$statePath = Join-Path $repoRoot '.work\local-demo\processes.json'

if (-not (Test-Path $statePath)) {
  Write-Host 'No local Demo process state was found.'
  exit 0
}

$state = Get-Content -Raw -LiteralPath $statePath | ConvertFrom-Json
$startedAt = [DateTime]::Parse([string]$state.startedAt)
foreach ($processId in @($state.frontendPid, $state.backendPid)) {
  if (-not $processId) { continue }
  $process = Get-CimInstance Win32_Process -Filter "ProcessId=$processId" -ErrorAction SilentlyContinue
  if (-not $process) { continue }
  $createdAt = [DateTime]$process.CreationDate
  if ($createdAt -lt $startedAt.AddSeconds(-5)) {
    Write-Warning "Skipping PID $processId because the PID was reused by an older process."
    continue
  }
  & taskkill.exe /PID $processId /T /F | Out-Null
}

Remove-Item -LiteralPath $statePath -Force -ErrorAction SilentlyContinue
Write-Host 'RightNow local Demo processes stopped.'
