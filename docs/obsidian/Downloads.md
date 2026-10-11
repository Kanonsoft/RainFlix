# Downloads

The website opens an introduction page at `#/` with actual bundled RainFlix screenshots in a responsive Three.js scene and a decoded trending-title backdrop. Text-only Download RainFlix and Open RainFlix on web actions link to `#/downloads` and `#/home`. The introduction header shows Downloads instead of a second Open action. Native apps still start at Home. Web catalog navigation and its drawer include a plain Downloads link. The download page keeps platform logos and direct installer actions without a RainFlix wordmark or a separate GitHub Releases link. Installer discovery uses the trusted repository release API.

Related: [[Windows Desktop Plan]], [[Configuration]], [[Architecture]].

The download page uses bundled Windows and Android brand marks rather than generic device icons; the Android mark comes from Simple Icons (CC0). Android remains upcoming on the public download page until its release assets are published.

Windows downloads resolve the latest public, non-prerelease GitHub Release for `RAINFLIX_CONFIG.downloads.githubRepository` (default `Kanonsoft/RainFlix`). The page picks an `.exe` installer, preferring x64 and excluding ARM/32-bit named assets, and displays its tag and file size. Only GitHub HTTPS asset URLs from that repository are accepted. No GitHub token or backend is needed. Lookups are cancellable, time out after eight seconds, and can be retried. Missing releases/assets and API errors show an honest status plus a link to the Releases page; no fake installer URL is constructed.

## Publishing Windows

See [Release Instructions](../releases/RELEASING.md) for both Windows and Android artifacts, separate platform notes, version/tag alignment, signing precautions, and the private-source/public-binary repository option. Android APK assets currently require a direct release link; the public download page still displays Coming soon.

1. Run `npm run desktop:build` to create an updated installer.
2. Create and publish a GitHub Release in the configured repository.
3. Attach `src-tauri/target/release/bundle/nsis/RainFlix_1.0.0_x64-setup.exe` (or the versioned installer produced by that build).
4. Once published, the website finds the installer automatically on the next downloads-page visit or refresh.

The local installer and GitHub Actions build artifact are not automatically public release assets. This feature does not build an installer, publish a release, or change deployment workflows. Private repositories cannot expose installers to anonymous visitors through this public lookup.
