# Downloads

Related: [[Windows Desktop Plan]], [[Configuration]], [[Architecture]].

The website header has a Download icon linking to `#/downloads`, with a matching mobile-drawer link. Both header entries are hidden in the desktop build. The page shows Windows and Android; Android is upcoming and has no download link.

Windows downloads resolve the latest public, non-prerelease GitHub Release for `RAINFLIX_CONFIG.downloads.githubRepository` (default `Kanonsoft/RainFlix`). The page picks an `.exe` installer, preferring x64 and excluding ARM/32-bit named assets, and displays its tag and file size. Only GitHub HTTPS asset URLs from that repository are accepted. No GitHub token or backend is needed. Lookups are cancellable, time out after eight seconds, and can be retried. Missing releases/assets and API errors show an honest status plus a link to the Releases page; no fake installer URL is constructed.

## Publishing Windows

1. Run `npm run desktop:build` to create an updated installer.
2. Create and publish a GitHub Release in the configured repository.
3. Attach `src-tauri/target/release/bundle/nsis/RainFlix_1.0.0_x64-setup.exe` (or the versioned installer produced by that build).
4. Once published, the website finds the installer automatically on the next downloads-page visit or refresh.

The local installer and GitHub Actions build artifact are not automatically public release assets. This feature does not build an installer, publish a release, or change deployment workflows. Private repositories cannot expose installers to anonymous visitors through this public lookup.
