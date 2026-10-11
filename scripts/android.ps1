param(
    [ValidateSet("init", "dev", "build")]
    [string]$Action = "build",
    [string]$Target = "aarch64",
    [switch]$Debug
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $root
if (-not $env:JAVA_HOME) {
    $bundledJava = "C:\Program Files\Android\Android Studio\jbr"
    if (Test-Path -LiteralPath "$bundledJava\bin\java.exe") { $env:JAVA_HOME = $bundledJava }
}
if (-not $env:ANDROID_HOME) { $env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk" }
if (-not $env:NDK_HOME) {
    $ndk = Get-ChildItem -LiteralPath "$env:ANDROID_HOME\ndk" -Directory |
        Sort-Object { [version]$_.Name } -Descending | Select-Object -First 1
    if ($ndk) { $env:NDK_HOME = $ndk.FullName }
}
foreach ($entry in @(@("JAVA_HOME", $env:JAVA_HOME), @("ANDROID_HOME", $env:ANDROID_HOME), @("NDK_HOME", $env:NDK_HOME))) {
    if (-not $entry[1] -or -not (Test-Path -LiteralPath $entry[1])) {
        throw "Missing $($entry[0]). Install Android Studio, SDK and NDK first."
    }
}
$env:Path = "$env:JAVA_HOME\bin;$env:ANDROID_HOME\platform-tools;$env:Path"
if ($Action -eq "init") {
    & npx tauri android init --ci
} elseif ($Action -eq "dev") {
    & npx tauri android dev
} else {
    if (-not $Debug) {
        & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "prepare-android-signing.ps1")
        if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    }
    $arguments = @("tauri", "android", "build", "--apk", "--target", $Target)
    if ($Debug) { $arguments += "--debug" }
    $previousPreference = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    & npx @arguments 2>&1 | Tee-Object -Variable buildOutput
    $nativeExit = $LASTEXITCODE
    $ErrorActionPreference = $previousPreference
    if ($nativeExit -ne 0 -and ($buildOutput -join "`n").Contains("Creation symbolic link is not allowed")) {
        $targets = @{
            aarch64 = @("aarch64-linux-android", "arm64-v8a", "Arm64")
            armv7 = @("armv7-linux-androideabi", "armeabi-v7a", "Arm")
            i686 = @("i686-linux-android", "x86", "X86")
            x86_64 = @("x86_64-linux-android", "x86_64", "X86_64")
        }
        $selected = $targets[$Target]
        if (-not $selected) { throw "Unsupported Android target: $Target" }
        $profile = if ($Debug) { "debug" } else { "release" }
        $variant = if ($Debug) { "Debug" } else { "Release" }
        $library = Join-Path $root "src-tauri\target\$($selected[0])\$profile\librainflix_lib.so"
        if (-not (Test-Path -LiteralPath $library)) { throw "Compiled Android library was not found." }
        $jni = Join-Path $root "src-tauri\gen\android\app\src\main\jniLibs\$($selected[1])"
        New-Item -ItemType Directory -Force -Path $jni | Out-Null
        Copy-Item -LiteralPath $library -Destination (Join-Path $jni "librainflix_lib.so") -Force
        Push-Location -LiteralPath (Join-Path $root "src-tauri\gen\android")
        try {
            & .\gradlew.bat ":app:assemble$($selected[2])$variant" "-x" ":app:rustBuild$($selected[2])$variant" "-PtargetList=$Target" "-ParchList=$($selected[2].ToLower())" "-PabiList=$($selected[1])"
            $nativeExit = $LASTEXITCODE
        } finally { Pop-Location }
    }
    exit $nativeExit
}
exit $LASTEXITCODE
