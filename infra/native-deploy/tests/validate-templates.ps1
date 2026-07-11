$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot

$units = Get-ChildItem (Join-Path $root 'systemd') -Filter '*.service'
if ($units.Count -ne 3) { throw "Expected 3 RightNow system units, found $($units.Count)" }

foreach ($unit in $units) {
    $content = Get-Content -Raw $unit.FullName
    if ($content -match '0\.0\.0\.0|--host\s+0\.0\.0\.0') {
        throw "$($unit.Name) contains a wildcard bind"
    }
    if ($content -notmatch 'NoNewPrivileges=true') {
        throw "$($unit.Name) is missing NoNewPrivileges"
    }
}

$backendEnv = Get-Content -Raw (Join-Path $root 'env/backend.env.example')
if ($backendEnv -notmatch '(?m)^HOST=127\.0\.0\.1$') { throw 'Backend must bind to loopback' }
if ($backendEnv -notmatch '(?m)^RAG_SERVICE_URL=http://127\.0\.0\.1:8000$') { throw 'Backend RAG URL is not loopback' }
if ($backendEnv -notmatch '(?m)^OPENCLAW_ADMIN_URL=http://127\.0\.0\.1:8787$') { throw 'Provisioner URL is not loopback' }

$provisionerEnv = Get-Content -Raw (Join-Path $root 'env/provisioner.env.example')
if ($provisionerEnv -notmatch '(?m)^PROVISIONER_BIND_ADDRESS=127\.0\.0\.1$') { throw 'Provisioner must bind to loopback' }

$nginx = Get-Content -Raw (Join-Path $root 'nginx/rightnow.locations.conf')
if ($nginx -match 'location\s+/\s*\{') { throw 'Snippet must not replace Personal OpenClaw root location' }
if ($nginx -notmatch 'location /rightnow/') { throw 'Missing RightNow frontend location' }
if ($nginx -notmatch 'location /rightnow-api/') { throw 'Missing RightNow API location' }
if ($nginx -notmatch 'proxy_pass http://127\.0\.0\.1:5000/api/;') { throw 'API is not proxied to loopback' }

$all = Get-ChildItem $root -Recurse -File | ForEach-Object { Get-Content -Raw $_.FullName }
if (($all -join "`n") -match '/root/\.openclaw/workspace(?:\s|$)') {
    throw 'A template references the Personal OpenClaw workspace'
}

Write-Output 'native deployment templates: OK'

