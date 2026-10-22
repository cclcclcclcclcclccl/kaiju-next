# Restore this project's existing free public instance after Windows sign-in.
$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
Set-Location -LiteralPath $projectRoot
$nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
$nodeExecutable = if ($nodeCommand) { $nodeCommand.Source } else { 'D:\node.js\node.exe' }
if (-not (Test-Path -LiteralPath $nodeExecutable)) { throw 'Node.js is not installed.' }
$recoveryLog = Join-Path $projectRoot 'data/public-site/login-recovery.log'
New-Item -ItemType Directory -Force (Split-Path $recoveryLog) | Out-Null
for ($attempt = 1; $attempt -le 3; $attempt++) {
    "$(Get-Date -Format o) Restore sharing attempt $attempt" | Out-File -LiteralPath $recoveryLog -Append -Encoding utf8
    & $nodeExecutable (Join-Path $projectRoot 'scripts/player/share.mjs') 2>&1 | Out-File -LiteralPath $recoveryLog -Append -Encoding utf8
    if ($LASTEXITCODE -eq 0) { exit 0 }
    if ($attempt -lt 3) { Start-Sleep -Seconds 20 }
}
exit 1
