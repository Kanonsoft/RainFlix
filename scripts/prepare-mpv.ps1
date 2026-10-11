$ErrorActionPreference = 'Stop'
Import-Module Microsoft.PowerShell.Utility

$version = 'v0.41.0-dev-g413ff0b1c-37085543729'
$archiveHash = '3E492E47BFEA0761924B7C6CC5509320FDB73A26F6C9E5590BAC13DD6CD53997'
$binaryHash = 'DB36261C4EE2835A6E886F8ED154350228CBA5C46622DAB1A873C6E76B629B93'
$url = "https://github.com/mpv-player/mpv/releases/download/git-release/mpv-${version}-x86_64-w64-mingw32-full.zip"
$root = Resolve-Path (Join-Path $PSScriptRoot '..')
$destination = Join-Path $root 'src-tauri\binaries'
$binary = Join-Path $destination 'mpv.exe'
$license = Join-Path $destination 'LICENSE.GPL'

if ((Test-Path $binary) -and (Test-Path $license) -and
    (Get-FileHash $binary -Algorithm SHA256).Hash -eq $binaryHash) {
    Write-Host 'Pinned mpv decoder is ready.'
    exit 0
}

$archive = Join-Path $env:TEMP "rainflix-mpv-$version.zip"
if (-not (Test-Path $archive) -or (Get-FileHash $archive -Algorithm SHA256).Hash -ne $archiveHash) {
    Invoke-WebRequest -Uri $url -OutFile $archive
}
if ((Get-FileHash $archive -Algorithm SHA256).Hash -ne $archiveHash) {
    throw 'Downloaded mpv archive failed SHA-256 verification.'
}

$staging = Join-Path $env:TEMP "rainflix-mpv-$version"
Expand-Archive -LiteralPath $archive -DestinationPath $staging -Force
if ((Get-FileHash (Join-Path $staging 'mpv.exe') -Algorithm SHA256).Hash -ne $binaryHash) {
    throw 'Extracted mpv executable failed SHA-256 verification.'
}
New-Item -ItemType Directory -Path $destination -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $staging 'mpv.exe') -Destination $binary -Force
Copy-Item -LiteralPath (Join-Path $staging 'LICENSE.GPL') -Destination $license -Force
Write-Host 'Pinned mpv decoder is ready.'
