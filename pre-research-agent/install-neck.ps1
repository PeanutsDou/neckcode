$ErrorActionPreference = 'Stop'

$agentDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$launcher = Join-Path $agentDir 'neck.bat'
if (-not (Test-Path -LiteralPath $launcher)) {
  throw "Missing launcher: $launcher"
}

$binDir = Join-Path $env:USERPROFILE 'bin'
New-Item -ItemType Directory -Force -Path $binDir | Out-Null

$shim = Join-Path $binDir 'neck.cmd'
$shimContent = @"
@echo off
call "$launcher" %*
"@
Set-Content -LiteralPath $shim -Value $shimContent -Encoding ASCII

$legacyShim = Join-Path $binDir 'nock.cmd'
if (Test-Path -LiteralPath $legacyShim) {
  Remove-Item -LiteralPath $legacyShim -Force
}

$currentUserPath = [Environment]::GetEnvironmentVariable('Path', 'User')
$pathItems = @()
if ($currentUserPath) {
  $pathItems = $currentUserPath -split ';' | Where-Object { $_ -ne '' }
}

$alreadyInPath = $pathItems | Where-Object { $_.TrimEnd('\') -ieq $binDir.TrimEnd('\') }
if (-not $alreadyInPath) {
  $newPath = (($pathItems + $binDir) -join ';')
  [Environment]::SetEnvironmentVariable('Path', $newPath, 'User')
  $env:Path = $env:Path + ';' + $binDir
  Write-Host "[Neck] Installed command: $shim"
  Write-Host "[Neck] Added to user PATH. Open a new terminal, then run: neck"
} else {
  Write-Host "[Neck] Installed command: $shim"
  Write-Host "[Neck] PATH already contains: $binDir"
}
