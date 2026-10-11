# Release Instructions

These instructions prepare releases; they do not publish anything automatically.
Current app/package version: `1.0.0`. The locally built EXE and APK already exist.

## Current Artifacts

| Platform      | File                                                                              |
| ------------- | --------------------------------------------------------------------------------- |
| Windows x64   | `src-tauri/target/release/bundle/nsis/RainFlix_1.0.0_x64-setup.exe`               |
| Android ARM64 | `src-tauri/gen/android/app/build/outputs/apk/arm64/release/app-arm64-release.apk` |

Release title suggestion: **RainFlix 1.0.0 - Windows and Android**.
Use one release containing both assets, with the Windows and Android sections
from [the combined notes](2026-10-11-landing-and-controls.md). Separate
[Windows notes](2026-10-11-windows.md) and [Android notes](2026-10-11-android.md)
are also provided for platform-specific announcements.

If `v1.0.0` already exists, do not replace its tag or silently reuse its version
for a new public update. Choose a new version, align the version fields in
`package.json`, `src-tauri/tauri.conf.json`, and `src-tauri/Cargo.toml`, update
lockfiles/generated Android version metadata through the build tools, and rebuild.
The currently supplied binaries still report `1.0.0`.

## Build and Verify

Run from the repository root in PowerShell:

```powershell
npm ci
npm run check
npm run test:e2e
npm run desktop:build
npm run android:build
```

For Pages changes, also run `npm run test:pages`. Native prerequisites and
limitations are described in the README and linked Obsidian notes.

Verify the Android signature using your installed SDK build tools:

```powershell
& "$env:LOCALAPPDATA\Android\Sdk\build-tools\36.0.0\apksigner.bat" verify --verbose src-tauri/gen/android/app/build/outputs/apk/arm64/release/app-arm64-release.apk
```

Optional SHA-256 verification records for release assets:

```powershell
Get-FileHash src-tauri/target/release/bundle/nsis/RainFlix_1.0.0_x64-setup.exe -Algorithm SHA256
Get-FileHash src-tauri/gen/android/app/build/outputs/apk/arm64/release/app-arm64-release.apk -Algorithm SHA256
```

Before publishing, install each release build and check startup, source
selection, pause/seek, subtitles/audio, next episode, Back/Escape, and an
upgrade preserving installed add-ons and My List. The latest build passed
132 browser tests and signature verification; this does not establish native
release playback on every device or provider.

Back up `src-tauri/gen/android/rainflix-release.jks` and
`src-tauri/gen/android/keystore.properties` together in private storage.
Never upload them. Future APK updates must use the same signing key.
Windows Authenticode signing is not configured in the current packaging config;
an APK signature is not a Windows installer signature.

## Publish on GitHub

1. Commit and push the exact source revision used for the binaries, excluding credentials, signing keys, caches, and generated installers.
2. Open the intended distribution repository's **Releases** and choose **Draft a new release**.
3. Select an unused matching version tag and the built commit as its target. For these binaries, use `v1.0.0` only if it has not already been released.
4. Enter the release title and paste the combined notes, or the relevant platform notes for separate releases.
5. Attach the EXE and APK listed above. The APK can be renamed to `RainFlix_1.0.0_android-arm64.apk` for clarity without changing its signature.
6. Keep a draft until installation checks and dependency/license obligations are reviewed. For a test build, mark it as a prerelease rather than implying production readiness.
7. Publish only when ready. For a production release intended for website discovery, leave prerelease disabled and mark it as latest.

These steps follow [GitHub's release documentation](https://docs.github.com/en/repositories/releasing-projects-on-github/managing-releases-in-a-repository).
Publishing from a public source repository also exposes its tagged source
archives. If source should remain private, publish binaries from a separate
public distribution repository instead.

## Website Download Behavior

`RAINFLIX_CONFIG.downloads.githubRepository` currently points to
`Kanonsoft/RainFlix`. The website selects an EXE from the latest public,
non-prerelease GitHub Release, along with an Android APK from that same release. Draft/private/prerelease assets are not discovered
through that flow. If you use a separate distribution repository, change this
configuration and rebuild/deploy the website explicitly.

Attach the signed Android APK alongside the EXE to enable both download buttons.
Android selection prefers universal, then ARM64 names; debug, unsigned, x86, and
ARMv7 assets are excluded. An absent installer shows a platform-specific
not-published message. Both assets must be on the latest eligible release;
the page does not search older releases for missing platforms.

Only attach distributable binaries and any required license/source materials.
Do not upload configured manifest secrets, local signing material, or private
configuration. Review mpv and other bundled dependency redistribution obligations
before public release.
