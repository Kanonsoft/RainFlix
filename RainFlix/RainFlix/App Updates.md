# App Updates

Windows and Android check the existing configured GitHub Releases repository for newer stable versions. The web catalog does not run the native update checker. No new server, GitHub token, background executable installer or APK installation permission is needed for the notification flow.

## User experience

- Automatic checks run during the initial native loading screen alongside account sync when online and enabled. The release request has a ten-second timeout and the startup gate has a thirty-second fail-safe. Checks repeat every six hours while open and retry on focus/reconnection when due; the notice retains its five-second fallback if no initial check completed. A single in-flight lookup is shared with Settings. Network errors never trap startup or playback.
- A non-blocking **RainFlix update available** notice includes the version and **Download update** action. It is suppressed on playback query routes and placed above Android's bottom navigation.
- **Remind me tomorrow** snoozes that version for 24 hours. A newer version can notify immediately. Settings retains its download action even after snoozing.
- **Settings -> App updates** shows installed version, a manual check, current status, and an automatic-check switch. This switch is device-local, not account-synced.
- Download opens the matching GitHub EXE/APK in the system browser. The user installs it normally; this is an update notification/download feature, not signed silent self-updating or a Play Store updater.

## Publishing an update

1. Increase the app version consistently in `package.json`, `src-tauri/tauri.conf.json`, and `src-tauri/Cargo.toml`. Regenerate lockfiles/version metadata using the build tooling. Android also needs a greater version code; retain the same app ID and signing key for upgrades.
2. Build and verify the Windows and Android installers, then publish both on a new public, non-prerelease GitHub Release in `RAINFLIX_CONFIG.downloads.githubRepository`.
3. Use a tag such as `v1.0.1` matching the built version. Semantic numeric comparison avoids `1.10` vs `1.9` string mistakes. The current installed version comes from Tauri; the browser-layout preview uses the package version.
4. Keep both installers on the latest eligible release. The shared Downloads resolver does not search older releases if an asset is missing. Only HTTPS asset URLs under the configured GitHub repository's release-download path are accepted.

**Already-installed builds that do not contain this checker cannot be notified retroactively.** Users must manually install a build containing this feature once. Later eligible releases can then trigger notices. Replacing files on a `v1.0.0` release or rebuilding with the same version does not produce a newer-version notice.

No release is published by implementation or local checks. Actual browser/OS download and installation require user action. Android install permissions, signature verification and Windows trust prompts are still handled by the operating system.

Implementation: `src/lib/app-updates.js`, `src/lib/downloads.js`, `src/components/AppUpdateNotice.jsx`, `src/components/UpdateSettings.jsx`.

Reference: [GitHub Releases API](https://docs.github.com/en/rest/releases/releases).
