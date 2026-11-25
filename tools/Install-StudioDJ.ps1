# Install only into an isolated test profile; never overwrite the actual Mixxx settings.
[CmdletBinding()]
param(
    [string]$MixxxExe = "$env:ProgramFiles\Mixxx\mixxx.exe",
    [string]$ProfilePath = "$env:LOCALAPPDATA\StudioDJ-Test\profile",
    [switch]$Launch
)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$resolved = [IO.Path]::GetFullPath($ProfilePath)
$real = [IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA 'Mixxx'))
if ($resolved.TrimEnd('\') -ieq $real.TrimEnd('\') -or $resolved.StartsWith($real.TrimEnd('\')+'\',[StringComparison]::OrdinalIgnoreCase)) {
    throw 'Refusing to modify your normal Mixxx profile.'
}
if (Get-Process -Name mixxx -ErrorAction SilentlyContinue) { throw 'Close Mixxx before installing.' }
if (!(Test-Path (Join-Path $root 'skins\StudioDJ\skin.xml'))) { throw 'Extract the complete candidate ZIP before running this installer.' }
New-Item -ItemType Directory -Force -Path $resolved | Out-Null
# Reject reparse points: a junction/symlink must not redirect into the normal profile.
$check = Get-Item -LiteralPath $resolved
while ($null -ne $check) {
    if (($check.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw "Refusing reparse point: $($check.FullName)" }
    $check = $check.Parent
}
$manifest = Get-Content -LiteralPath (Join-Path $root 'SHA256SUMS.json') -Raw | ConvertFrom-Json
foreach ($item in $manifest.PSObject.Properties) {
    $file = Join-Path $root $item.Name
    if ((Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash -ine $item.Value) { throw "Integrity check failed: $($item.Name)" }
}
foreach ($folder in @('skins','controllers')) {
    $dest = Join-Path $resolved $folder
    if (Test-Path -LiteralPath $dest) {
        if (((Get-Item -LiteralPath $dest).Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw "Refusing reparse point: $dest" }
    }
    New-Item -ItemType Directory -Force -Path $dest | Out-Null
    foreach ($entry in (Get-ChildItem -LiteralPath (Join-Path $root $folder))) {
        $target = Join-Path $dest $entry.Name
        if (Test-Path -LiteralPath $target) { throw "Target already exists: $target. Use a fresh -ProfilePath to test another build." }
    }
}
Copy-Item -LiteralPath (Join-Path $root 'skins\StudioDJ') -Destination (Join-Path $resolved 'skins') -Recurse
Get-ChildItem -LiteralPath (Join-Path $root 'controllers') | Copy-Item -Destination (Join-Path $resolved 'controllers')
$cfg = Join-Path $resolved 'mixxx.cfg'
if (!(Test-Path -LiteralPath $cfg)) {
    "[Config]"+[Environment]::NewLine+"ResizableSkin StudioDJ"+[Environment]::NewLine | Set-Content -LiteralPath $cfg -Encoding ascii
}
Write-Host "Studio DJ installed in isolated profile: $resolved"
Write-Host 'Configure audio and select the Studio DJ NS6 mapping only in this test profile. Keep Auto DJ disabled.'
if ($Launch) {
    if (!(Test-Path -LiteralPath $MixxxExe)) { throw 'Mixxx not found. Supply -MixxxExe with the installed Mixxx 2.5.6 executable.' }
    & $MixxxExe --settingsPath $resolved --developer
}
