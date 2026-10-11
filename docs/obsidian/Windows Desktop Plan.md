---
tags: [rainflix, desktop, windows, planning]
---

# Windows Desktop Plan

Related: [[README|RainFlix Notes]], [[Architecture]], [[Configuration]], [[Title Playback]], [[Add-ons]], [[Browser WebTorrent]], [[Native Torrent Desktop]], [[Stremio Service]], [[Troubleshooting]].

Status: Windows x64 installer with native torrent transport and bundled mpv decoder built locally on 2026-10-04. Installation, startup, and playback in the installed app have not yet been verified.

## Goal and Decisions

Build an installable Windows RainFlix application in this repository using Tauri 2, the existing React interface, and Microsoft's WebView2 renderer. Share the catalog, title pages, episodes, add-on protocol, and player selection with the website.

The first deliverable is a private Windows x64 installer that opens locally bundled RainFlix assets and plays supported sources. The app-owned torrent transport and bundled mpv decoder were implemented before durable desktop data at the user's request. Subsequent milestones add durable data and Windows integration. Packaging alone does not prove torrent peer or decoder compatibility.

| Decision           | Planned default                                                                   |
| ------------------ | --------------------------------------------------------------------------------- |
| Repository         | Existing RainFlix repository with `src-tauri/`                                    |
| Frontend           | Existing React/Vite, JavaScript, Tailwind, Lucide, and hash routes                |
| Native application | Tauri 2 with Rust commands for desktop functions                                  |
| First target       | Windows x64; Windows 11 primary, Windows 10 compatibility subject to verification |
| Installer          | NSIS setup `.exe`, per-user installation                                          |
| First window       | Standard Windows title bar, dark background, RainFlix icon, resizable layout      |
| Asset delivery     | Bundled Vite output; a dedicated local Vite port during development               |
| Build output       | `dist-desktop/` for desktop; `dist/` for the website                              |
| Distribution       | Local/private artifacts first; releases and automatic updates later               |
| Initial playback   | Existing iframe and browser-compatible MP4/HLS players                            |
| Native torrents    | Engine plus mpv decoder added before persistent add-ons; live playback unverified |
| Mobile             | Future platform adapter; Windows is the current development target                |

Tauri documents Rust with the MSVC toolchain, Microsoft C++ Build Tools, and WebView2 as Windows development requirements. Audit installed prerequisites when development begins. [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/)

Use the installer's WebView2 bootstrapper when the runtime is missing; this installation path requires internet access. Evaluate an offline runtime bundle later if needed. Tauri supports NSIS and MSI packaging; NSIS is our first target. [Windows installer reference](https://v2.tauri.app/distribute/windows-installer/)

## Current Baseline

The notes and reviewed source establish these constraints:

- `TitleDetails` is shared by TMDb and add-on titles. `TitlePlayers` owns fullscreen, `AddonSources` owns lookup/selection, and `AddonPlayer` owns HTML video playback.
- Installed registrations now persist in IndexedDB across restarts. Only ID, manifest address, enabled state and name are stored; manifests are re-fetched. Windows-protected credential storage is still a future release requirement.
- My List and Continue Watching use localStorage. Playback timestamps have separate bounded storage for TMDb/IMDb identities; custom add-on timestamps now persist as bounded numeric progress keyed by content/episode identity.
- Browser WebTorrent depends on WebRTC peers, WebSocket trackers, and a service worker. A desktop wrapper alone cannot connect it to conventional torrent swarms.
- Stremio Service is optional and external. RainFlix does not install it, alter its settings, or manage its torrents.
- HTML video depends on renderer container/codec support. Finding a source is separate from playing its media.
- `addonFetch` handles aborts, timeouts, no-store requests, and omitted cookies. Media and subtitles have separate delivery constraints.
- `vite.config.js` infers a GitHub Pages base in CI builds. Desktop mode now keeps `/` and outputs `dist-desktop/`.
- `src/main.jsx` registers the app service worker in production only for the website. Desktop mode skips it.
- Startup has recovery UI, the TMDb-poster loader, lazy routes, and optional isolated analytics. Desktop data hydration must fit into this existing startup flow.

Existing behavior remains documented in the linked notes. Desktop differences will be recorded as platform-specific changes when implemented.

## Current Desktop Setup

`npm run desktop:dev` opens the Tauri development window using Vite on `127.0.0.1:5174`. `npm run desktop:build` bundles the frontend into `dist-desktop/` and produces an NSIS setup executable under `src-tauri/target/release/bundle/nsis/`. Both commands require the Windows Tauri prerequisites: Rust with the MSVC target, Visual Studio C++ Build Tools/Windows SDK, and WebView2. The application is configured for a per-user install. The existing `npm run build` still targets GitHub Pages and writes to `dist/`.

The manually triggered `.github/workflows/desktop.yml` builds an unsigned private installer artifact on a Windows runner. It does not publish a release or change the Pages site. Rust 1.99.0 with the x64 MSVC target was installed locally for the first native build; `npx tauri info` also detected WebView2 and Visual Studio Build Tools 2026. `npm run desktop:build` produced `src-tauri/target/release/bundle/nsis/RainFlix_1.0.0_x64-setup.exe`. The installer is unsigned. Native compilation succeeded, but installation and real WebView2 playback remain unverified. Keep the generated `src-tauri/Cargo.lock` with the source for repeatable future builds.

The desktop shell reuses the existing hash routes and title/player interface. External HTTP(S), mail, and magnet links from the main app are handed to Windows through Tauri's opener; provider iframes receive no Tauri capabilities. Desktop share text uses `publicSiteUrl` in `scripts/config.js`. The website service worker and browser WebTorrent mode are disabled in the desktop build. [[Native Torrent Desktop|Native torrent playback]] and its separate mpv fullscreen window are built in; Stremio Service remains independently installed and optional. Durable add-ons, broader native window integration, and protected credentials remain later milestones. Add-on registrations now persist in IndexedDB in this shell.

## Proposed Structure

The shell, platform selection, torrent engine, decoder preparation, and workflow paths below are implemented. Storage and credential modules remain future work.

```text
RainFlix/
  src/
    components/              Shared interface and playback
    lib/                     Existing catalog/add-on/progress logic
    platform/
      index.js               Platform selection and capabilities
      web.js                 Browser behavior
    desktop.js              Lazy Tauri external-link bridge
  lib/native-torrent.js     Lazy native playback command bridge
  src-tauri/
    Cargo.toml
    Cargo.lock             Resolved native dependencies
    tauri.conf.json
    capabilities/
    icons/
    src/
      lib.rs                 Setup and command registration
      main.rs                Windows entry point
      native_torrent.rs      In-process torrent and local media endpoint
    binaries/                Generated pinned mpv decoder, bundled in installer
  scripts/prepare-mpv.ps1     Decoder download and SHA-256 verification
      storage.rs             Planned ordinary data and migrations
      credentials.rs         Planned protected configuration
  docs/obsidian/
    Windows Desktop Plan.md
  .github/workflows/
    desktop.yml              Manual Windows installer artifact build
  dist-desktop/              Generated and ignored frontend
```

Keep Windows dependencies in `src-tauri/` and the desktop adapter; catalog cards and metadata components call the shared interface.

## Platform Interface

Use a small adapter for operations that differ by platform, with explicit capabilities for storage, fullscreen, external links, sharing, browser torrents, and future native playback.

| Responsibility       | Web                          | Desktop                                                       |
| -------------------- | ---------------------------- | ------------------------------------------------------------- |
| Initialization       | Existing browser stores      | Hydrate native data into memory before consumers mount        |
| Add-on registrations | Existing session store       | Durable registrations with protected configured URLs          |
| Library and progress | Existing localStorage/memory | Versioned native store and immediate memory updates           |
| External links       | Browser links                | Validated OS opener                                           |
| Share title          | Browser share/clipboard      | Copy public title, synopsis, and website link                 |
| Fullscreen           | Fullscreen API and overlay   | Window fullscreen and shared overlay                          |
| Source lookup        | Existing fetch               | Existing fetch first; scoped native networking where required |
| Playback             | Existing players             | Existing players and selected native torrent playback         |

Keep native imports lazy and platform selection explicit so the browser can boot independently. Grant native command access to the bundled main interface only. Embedded provider pages receive no native permissions and no generic `postMessage` to Rust bridge. Retain existing iframe origin/window/title/episode validation. [Tauri capabilities](https://v2.tauri.app/security/capabilities/)

## Build and Startup

Add a desktop Vite mode with an explicit root base and `dist-desktop/` output. It takes precedence over `GITHUB_ACTIONS` and `GITHUB_REPOSITORY`. The website retains its Pages base and `dist/` output. Point Tauri's `frontendDist` at the desktop output. [Tauri with Vite](https://v2.tauri.app/start/frontend/vite/)

Planned commands: `desktop:dev`, `desktop:build`, and a desktop frontend build command. Use a dedicated development port with strict port handling, matching Tauri's development URL. Keep the existing browser development command available.

The installed application loads built assets and lazy chunks without a development server. TMDb images/metadata, catalogs, and streams still depend on their remote services. Offline startup can render the bundled interface, saved data, and useful retry states.

Initialize desktop storage before add-on/library consumers read it. Current module-level synchronous reads and React initializers cannot simply call asynchronous Rust commands. Add bounded hydration, ready/error states, and a memory snapshot. A storage error must not silently overwrite saved registrations with an empty list.

Use bundled assets instead of app-shell service-worker caching on desktop. Evaluate browser torrent worker support separately in the installed WebView2 app and expose only verified modes. Do not assume service-worker or browser torrent compatibility from a successful Vite preview.

## Desktop Data

Store ordinary data in RainFlix's per-user application data directory with a schema version, validated reads, atomic writes, and a recoverable migration copy. Start with bounded JSON; introduce SQLite only if the data model or query needs justify it.

| Data                                                      | Storage policy                                                                                    |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| My List and Continue Watching                             | Persist existing ordinary title fields and bounded history                                        |
| Playback timestamps                                       | Persist content identity, episode/video identity, position, duration, completion, and update time |
| Add-on installation                                       | Persist stable registration ID, enabled state, and sanitized public descriptors                   |
| Configured manifest URL and provider token                | Windows-protected credential backend; ordinary records contain references                         |
| Add-on catalog/meta/stream/subtitle responses             | Memory only; fetch fresh                                                                          |
| Signed stream URLs, source descriptors, temporary headers | Memory only; excluded from progress, exports, and logs                                            |
| Window placement and preferences                          | Persist ordinary settings; restore within current display bounds                                  |
| Future torrent pieces                                     | Dedicated bounded temporary cache owned by RainFlix                                               |

Evaluate Credential Manager or DPAPI-protected storage during the data milestone. A failure to save a configured registration must produce a clear state rather than a plaintext fallback. App-wide defaults stay separate from per-device credentials; bundled configuration is readable by the installed user.

Preserve immediate progress updates in memory, writes around every five seconds during playback, and final flushes on pause/seek/close. Coordinate native window shutdown with a bounded flush and resource cleanup. Record native progress only after `playing`; trailers and live channels remain excluded.

For custom add-on content, persist only a stable registration namespace and the content/video identifiers needed to resume. Re-fetch metadata after reopening; catalog-only titles without a metadata provider may require revisiting their catalog. Keep complete add-on responses out of the history.

Desktop and Chrome/Brave/GitHub Pages have separate storage origins. Start with a separate desktop profile. Later explicit import/export can transfer ordinary library/progress data; configured add-on credentials require separate deliberate handling.

## Playback Approach

Preserve episode -> provider -> source -> fullscreen navigation, sole-result playback, manual provider selection, the bounded episode panel, empty Home catalog suppression, and logo-only loading.

Use HTML video/HLS playback for compatible add-on streams and the embedded mpv surface for native torrents. Built-in iframe providers are removed; trailers retain their iframe. Keep the full-window overlay when system fullscreen is unavailable.

A native HTTP adapter may later help provider metadata requests. Preserve aborts, timeouts, normalization, redaction, and no-store semantics. Metadata fetch success does not solve HLS playlists, segments, keys, subtitles, headers, or media range requests. Scope native networking to explicit installed providers and configured services.

For streams requiring request headers, evaluate a media adapter or app-owned delivery path that handles ranges, redirects, HLS resources, and teardown. Keep unsupported sources marked accordingly until that path exists.

For conventional torrents, the first transport uses the maintained Rust `librqbit` engine in-process. It preserves the selected index, including zero, or chooses the largest supported file when absent; preserves tracker information; and delivers seekable byte ranges over a tokenized loopback URL. Session cancellation, a 12 GiB selected-file limit, and upload/peer caps are implemented. A pinned, bundled mpv decoder plays the selected torrent inside the RainFlix main window, with the WebView2 surface hidden during native playback and progress returning to RainFlix. Playback, cleanup, and peer behavior still need installed-app verification; stricter total cache accounting is future work. See [[Native Torrent Desktop]].

A torrent engine retrieves bytes; decoding is separate. The bundled mpv build handles common video/audio containers and codecs independently of WebView2. Its child window uses RainFlix's Lua controls for audio/embedded subtitles and time updates. The native embedded smoke test verifies visible video and volume/speed clicks. The mpv build is GPLv3 and needs license/source review before public distribution. Android reuse of the frontend is planned; engine/decoder portability must be assessed separately.

## Development Milestones

### 1. Windows Shell and Installer

- Audit Node/npm, Rust MSVC, C++ tools, Windows SDK, and WebView2; document missing prerequisites.
- Add Tauri, stable app identity, existing RainFlix icon assets, the standard window, and desktop build mode.
- Introduce the platform boundary, external-link handling, fullscreen integration, and desktop worker policy.
- Produce a local NSIS installer with bundled frontend assets.

Complete when the installed app starts without Vite or GitHub Pages, renders Home and lazy title routes, navigates Back correctly, opens external destinations deliberately, and plays a compatible fixture with working close/fullscreen behavior. Record real provider availability separately from shell startup.

### 2. Persistent Add-ons and History

- Add native storage/credential adapters, startup hydration, migrations, and bounded writes.
- Restore registrations and enabled states after full app restart; refresh manifests without requesting media.
- Persist My List, Continue Watching, episode timestamps, and minimal custom content positions.
- Flush on shutdown and recover from malformed/unavailable storage.

Complete when restarts/upgrades preserve data, provider changes resume the correct episode where supported, persistent history contains no stream responses or signed URLs, and failed hydration cannot overwrite saved state.

### 3. Windows Interaction

- Add desktop preferences and remembered valid window placement.
- Handle Escape/Back, keyboard/remote navigation, clipboard sharing, and minimize/restore behavior.
- Add single-instance handling and `rainflix://` title links; hydrate data before cold/warm link navigation.
- Continue sharing public website URLs. Desktop links select a title without automatically playing or installing an add-on.

Complete when second launch activates the existing app, links choose the correct title, minimizing preserves intentional playback, and closing stops app-owned media.

### 4. Private Distribution and Updates

- Add an independent Windows artifact workflow while Pages continues publishing `dist/`.
- Align app/package/installer versions; retain Rust/npm lockfiles and explicit desktop asset bases in CI.
- Document installation, upgrade, and uninstall. Preserve user data by default and clear it only through an explicit action.
- Add updates after selecting a reachable distribution endpoint and protecting signing material. A private repository's release assets may require authentication, so installed-app access needs a deliberate distribution design.

Complete when fresh installation and upgrade preserve expected behavior/data, update failures leave the installed version usable, and updates do not interrupt playback.

Tauri updater signatures and Windows installer code signing serve different purposes. The updater verifies signed artifacts; choose Windows signing arrangements before public distribution. [Tauri updater](https://v2.tauri.app/plugin/updater/)

### 5. App-owned Torrent Playback

Implementation arrived ahead of milestone 2. The transport and installer build are complete; live playback, seeking, cleanup, and release verification remain open.

- Select an existing engine and integrate narrowly scoped playback commands.
- Start only after source selection or the sole playable result of an explicit provider lookup.
- Implement selected-file streaming, range/seek delivery, measured buffering, upload/cache limits, and session ownership.
- Release owned lookup/media/torrent resources on source/provider/episode/mode changes and app exit.
- Retain Stremio Service as a manual external option without modifying its configuration or torrents.

Complete when a controlled torrent with a conventional peer plays/seeks without a separate Stremio installation, file indexes work, stopping ends RainFlix-owned transfers, and startup/settings/Connect cause no transfer.

### 6. Expanded Media Support

The Windows torrent path now has broad format support through bundled mpv. The remaining work is installed-app verification, tighter in-app window integration, external subtitle handoff, and other source types.

- Evaluate native playback for formats installed WebView2 cannot decode.
- Integrate subtitles, audio tracks, seek/resume, buffering events, keyboard control, and error reporting.
- Assess casting, local files, and explicit downloads when requested and supported by the selected engine.

Complete when advertised formats have playback/cleanup evidence and unsupported media has useful actions. Native media work must preserve the existing iframe and website flows.

## Future Verification

The current no-testing preference remains in effect. No application or playback tests were run during the shell or native torrent implementation. The following criteria belong to development/release verification when testing resumes:

- Retain browser checks and the Pages production check; add focused checks for changed platform behavior.
- Use actual Windows builds and installed WebView2 checks. Browser Playwright fixtures alone do not establish desktop compatibility.
- Cover hydration, persistence, migration, episode resume, cancellation, shutdown, and independent web/desktop asset bases.
- Use deterministic MP4/HLS/subtitle fixtures and a controlled torrent peer. Record live provider outcomes separately.
- Include offline startup, missing WebView2, DPI/display changes, failed updates, and data preservation during upgrades.
- Record Windows and WebView2 versions with each verified private build.

## Start Point

- [x] Review the existing notes, storage modules, playback boundaries, and workflows.
- [x] Record the desktop architecture and milestones.
- [x] Begin milestone 1 after the user proceeds with development.

Finalize the stable app identifier and version before public distribution. Choose the credential backend and update endpoint during their relevant milestones using actual compatibility results. Review bundled mpv licensing and source obligations before public distribution.

The Windows x64 installer with native torrent transport and decoder is available locally. Next verify its installation, startup, and playback on Windows, then proceed with durable add-ons and history. mpv extends torrent video support independently of WebView2.
