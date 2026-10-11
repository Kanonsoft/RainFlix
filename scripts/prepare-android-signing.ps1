$ErrorActionPreference = "Stop"
$android = Join-Path (Split-Path -Parent $PSScriptRoot) "src-tauri\gen\android"
$properties = Join-Path $android "keystore.properties"
$keystore = Join-Path $android "rainflix-release.jks"
if (Test-Path -LiteralPath $properties) {
    if (-not (Test-Path -LiteralPath $keystore)) { throw "Android signing properties exist but the keystore is missing." }
    Write-Output "Android release signing key is ready."
    exit 0
}
if (Test-Path -LiteralPath $keystore) { throw "An Android signing key already exists. Restore its keystore.properties instead of replacing it." }
$java = if ($env:JAVA_HOME) { $env:JAVA_HOME } else { "C:\Program Files\Android\Android Studio\jbr" }
$keytool = Join-Path $java "bin\keytool.exe"
if (-not (Test-Path -LiteralPath $keytool)) { throw "Java keytool was not found." }
$random = New-Object byte[] 32
$generator = [System.Security.Cryptography.RandomNumberGenerator]::Create()
$generator.GetBytes($random)
$generator.Dispose()
$password = [Convert]::ToBase64String($random)
$env:RAINFLIX_STORE_PASSWORD = $password
try {
    & $keytool -genkeypair -noprompt -keystore $keystore -alias rainflix -keyalg RSA -keysize 3072 -validity 10000 -storetype JKS -storepass:env RAINFLIX_STORE_PASSWORD -keypass:env RAINFLIX_STORE_PASSWORD -dname "CN=RainFlix, OU=Applications, O=Kanonsoft"
    if ($LASTEXITCODE -ne 0) { throw "Could not create Android signing key." }
    [System.IO.File]::WriteAllText($properties, "storeFile=rainflix-release.jks`nstorePassword=$password`nkeyAlias=rainflix`nkeyPassword=$password`n", [System.Text.UTF8Encoding]::new($false))
} finally {
    Remove-Item Env:RAINFLIX_STORE_PASSWORD -ErrorAction SilentlyContinue
}
Write-Output "Created a private Android release key. Back up rainflix-release.jks and keystore.properties together; neither is committed."
