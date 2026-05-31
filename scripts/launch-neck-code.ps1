$ErrorActionPreference = 'Stop'

$Root = 'D:\AR\deepseekcode'
$Node = 'C:\Program Files\nodejs\node.exe'
$ElectronCli = Join-Path $Root 'node_modules\electron\cli.js'

if (-not (Test-Path -LiteralPath $Node)) {
  $Node = 'node.exe'
}

if (Test-Path -LiteralPath $ElectronCli) {
  Start-Process -FilePath $Node -ArgumentList @($ElectronCli, '.') -WorkingDirectory $Root -WindowStyle Hidden
  exit 0
}

$Npm = 'C:\Program Files\nodejs\npm.cmd'
if (-not (Test-Path -LiteralPath $Npm)) {
  $Npm = 'npm.cmd'
}

Start-Process -FilePath $Npm -ArgumentList @('start') -WorkingDirectory $Root -WindowStyle Hidden
