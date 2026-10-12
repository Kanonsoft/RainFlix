# Downloads

Current landing behavior is documented in [[Landing]]. It replaces the older introduction/strip layouts described below. Web mobile catalog navigation now uses the bottom bar, not a drawer; Downloads stays in the current tab there, while landing-page actions open new tabs.

The website opens its featured-movie introduction at `#/`; see [[Landing]] for trailers and discovery carousels. Download RainFlix and Open RainFlix on web actions open `#/downloads` and `#/home` in new tabs. Native apps still start at Home. Web catalog navigation includes a plain Downloads link staying in the current tab, also in the mobile bottom bar. The download page keeps platform logos and direct installer actions without a RainFlix wordmark or a separate GitHub Releases link. Actions align to the right and vertically center in their platform rows; narrow screens wrap actions below the details. Installer discovery uses one trusted repository release API request for both platforms.

Related: [[Windows Desktop Plan]], [[Configuration]], [[Architecture]].

Mobile download rows use a compact stacked layout with full-width installer actions beneath platform details; desktop keeps the right-aligned actions. The GitHub Pages smoke test follows the current Browse header route rather than the retired Movies navigation.

The web header and mobile bottom-bar Downloads links stay in the current tab. Landing actions open new tabs. Direct visits to Downloads initialize the shared fixed backdrop from the first Trending Movies hero item, matching Home; navigation from an existing catalog keeps its current backdrop. Reduced-animation settings still use the solid background.

Landing cards use centered TMDb title logos (RainFlix R fallback) over slightly darkened thumbnails, without text captions or a colored strip background. Two rows support slow automatic looping plus manual scrolling. The background remains fixed to the viewport, fading from the blurred trailer to matching film artwork.

The download page uses bundled Windows and Android brand marks rather than generic device icons; the Android mark comes from Simple Icons (CC0). Published APK assets now produce an Android download action instead of a hardcoded Coming soon label.

Downloads resolve the latest public, non-prerelease GitHub Release for `RAINFLIX_CONFIG.downloads.githubRepository` (default `Kanonsoft/RainFlix`). Windows picks an `.exe`, preferring x64 and excluding ARM/32-bit named assets. Android picks an `.apk`, preferring universal then ARM64 names, excluding debug, unsigned, x86, and ARMv7 variants. Generic APK names remain accepted. Each action displays its tag and available file size. Only GitHub HTTPS asset URLs from that repository are accepted. No GitHub token or backend is needed. Lookups are cancellable, time out after eight seconds, and can be retried. Missing assets show a platform-specific not-published status; no fake installer URL is constructed. Both installers must be attached to the latest eligible release; older releases are not searched.

## Publishing Windows

See [Release Instructions](../releases/RELEASING.md) for both Windows and Android artifacts, separate platform notes, version/tag alignment, signing precautions, and the private-source/public-binary repository option.

1. Run `npm run desktop:build` to create an updated installer.
2. Create and publish a GitHub Release in the configured repository.
3. Attach `src-tauri/target/release/bundle/nsis/RainFlix_1.0.0_x64-setup.exe` (or the versioned installer produced by that build).
   Attach `src-tauri/gen/android/app/build/outputs/apk/arm64/release/app-arm64-release.apk` to the same release for Android discovery.
4. Once published, the website finds the installer automatically on the next downloads-page visit or refresh.

The local installer and GitHub Actions build artifact are not automatically public release assets. This feature does not build an installer, publish a release, or change deployment workflows. Private repositories cannot expose installers to anonymous visitors through this public lookup.
