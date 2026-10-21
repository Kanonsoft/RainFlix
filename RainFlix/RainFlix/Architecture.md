---
tags: [rainflix, development]
---

# Architecture

## Viewport Catalogs

`ViewportCatalog` mounts a catalog's card grid only when its reserved slot enters the viewport, keeping it mounted afterward so scrolling back does not refetch or reset the row. Home and legacy category pages defer Continue Watching, trending, newest rows, and Browse grids. Built-in feed metadata is still prepared with the hero, but lower card DOM/artwork is not rendered at startup; Browse's first batch is no longer part of startup readiness. Its existing sentinel loads batches during scrolling. Add-on Home rows are individually deferred, including their catalog requests, and keep loading space until lookup completes. Empty, failed, and input-required rows disappear after activation. Routes reset deferred slots, and add-on requests abort on removal/unmount. Browsers without IntersectionObserver fall back to eager rendering.

Registration persistence lives in `src/lib/addon-storage.js` (IndexedDB), while fresh manifests stay in the runtime registry. `src/lib/playback-preferences.js` stores only provider IDs, quality and track preferences, separate from timestamps and expiring stream URLs. Title pages perform cancellable availability lookups before listing Streams. See [[Title Playback#Remembered Playback]].

Related: [[README|RainFlix Notes]], [[Configuration]], [[Yastream]], [[Torrentio]], [[Browser WebTorrent]], [[Native Torrent Desktop]].

Navigation uses Home, Browse, My List, native Settings and native Add-ons (last). `/browse` shares the result grid and infinite pagination with SearchPage, but shows only type/genre/year filters without a search bar or promotional heading. `/search` shows only the query bar and results, without filters. Person and production-company links retain their dedicated result queries; title genre links open filtered Browse. Legacy movie/series/genre/year routes remain valid for old links, but are not header items. My List section headings have no decorative icons.

The Windows shell is being developed in this repository. Tauri builds the React app from `dist-desktop/` while the website still uses `dist/`; see [[Windows Desktop Plan]].

| File                                                                                           | Responsibility                                                                            |
| ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| [scripts/config.js](../../scripts/config.js)                                                   | Runtime settings and provider configuration                                               |
| [src/platform/index.js](../../src/platform/index.js)                                           | Desktop capability selection and public sharing URL                                       |
| [src/platform/desktop.js](../../src/platform/desktop.js)                                       | Lazy Tauri external-link opener for the main window                                       |
| [src-tauri/tauri.conf.json](../../src-tauri/tauri.conf.json)                                   | Desktop window, Vite output, and NSIS packaging                                           |
| [scripts/rainflix-api.js](../../scripts/rainflix-api.js)                                       | TMDb mapping/caching and iframe URL builders                                              |
| [src/lib/api.js](../../src/lib/api.js)                                                         | React access to configuration and legacy API, title routes                                |
| [src/components/PrivacyAnalytics.jsx](../../src/components/PrivacyAnalytics.jsx)               | Optional, lazy-loaded analytics client and isolated event forwarding                      |
| [src/lib/yastream.js](../../src/lib/yastream.js)                                               | Config encoding, resource URLs, abortable lookups, stream/subtitle normalization          |
| [src/lib/torrentio.js](../../src/lib/torrentio.js)                                             | IMDb resource URLs, configured manifest handling, direct/torrent source normalization     |
| [src/lib/browser-torrent.js](../../src/lib/browser-torrent.js)                                 | Browser WebTorrent mode, WebRTC magnets, file selection, progress, and lifecycle          |
| [src/lib/native-torrent.js](../../src/lib/native-torrent.js)                                   | Desktop source adaptation, Tauri command bridge, and cancellation                         |
| [src-tauri/src/native_torrent.rs](../../src-tauri/src/native_torrent.rs)                       | App-owned torrent session, selected-file streaming, and local ranged media delivery       |
| [scripts/prepare-mpv.ps1](../../scripts/prepare-mpv.ps1)                                       | Pinned, checksum-verified mpv decoder preparation for Windows builds                      |
| [src/lib/service-worker.js](../../src/lib/service-worker.js)                                   | Shared offline/WebTorrent worker registration across local and deployed builds            |
| [src/lib/stremio-service.js](../../src/lib/stremio-service.js)                                 | Service address validation, per-device preferences, read-only checks, torrent URLs        |
| [src/components/TorrentPlaybackSettings.jsx](../../src/components/TorrentPlaybackSettings.jsx) | Browser, Stremio Service, and external torrent mode selector                              |
| [src/components/StremioServiceSettings.jsx](../../src/components/StremioServiceSettings.jsx)   | Service controls and abortable connection status                                          |
| [src/lib/addon-streams.js](../../src/lib/addon-streams.js)                                     | Shared timeout/cancellation, HTTP stream and subtitle normalization                       |
| [src/components/AddonPlayer.jsx](../../src/components/AddonPlayer.jsx)                         | Shared native video, HLS lifecycle, captions, stream picker, external links, retry states |
| [src/pages/WatchPage.jsx](../../src/pages/WatchPage.jsx)                                       | Legacy watch URL redirect to shared title pages                                           |
| [src/components/library/LibraryProvider.jsx](../../src/components/library/LibraryProvider.jsx) | Saved titles and Continue Watching                                                        |
| [public/sw.js](../../public/sw.js)                                                             | App/TMDb/image caches; leaves Yastream/media requests alone                               |
| [tests/yastream.spec.js](../../tests/yastream.spec.js)                                         | Deterministic playback, subtitle, episode, failure, and responsive tests                  |
| [tests/torrentio.spec.js](../../tests/torrentio.spec.js)                                       | IMDb matching, torrent file selection, explicit direct playback, failures, responsive UI  |
| [tests/stremio-service.spec.js](../../tests/stremio-service.spec.js)                           | Local service playback, request gating, settings, file IDs, failure and responsive tests  |
| [tests/helpers/playback.js](../../tests/helpers/playback.js)                                   | Shared mocked metadata and generated media fixtures                                       |

## Boundaries

The current add-on registry is `src/lib/addons.js`, with directory/installation UI in `src/pages/AddonsPage.jsx`. Installed providers use the shared player. Built-in Yastream/Torrentio entries are disabled by default. See [[Add-ons]] for supported manifest capabilities and storage behavior.

Catalog/metadata normalization and memory-only previews live in `src/lib/addon-catalogs.js`. `TitlePage` and `AddonTitlePage` load metadata into shared `TitleDetails`. IMDb add-on titles use built-in TMDb metadata; custom content IDs use internal add-on metadata selection. `TitlePlayers` owns the fullscreen overlay, `AddonSources` owns source lookup/selection, and `AddonPlayer` plays only the selected stream. `RelatedCarousel` presents similar titles. See [[Title Playback]].

The existing iframe builders remain in the legacy API. Optional Yastream/Torrentio adapters and installed providers appear beside title details and share native video playback. The website stays static. Browser WebTorrent is a lazy, in-tab WebRTC engine; the Windows app has an in-process conventional torrent engine and a bundled mpv decoder in a separate native window. Stremio Service and external torrent apps remain manual alternatives. RainFlix includes no transcoder or hosted torrent backend.

Analytics is outside the required application module graph. When its configuration is empty, RainFlix does not request the analytics component or an external script. Browser blocking of either optional resource must not prevent startup or interaction.

Each title/season/episode has its own player instance. Each stream selection destroys the previous video's HLS instance, listeners, timers, and text cues. Abort signals prevent late provider responses from replacing the current episode.

`src/lib/playback-progress.js` owns the bounded, provider-independent timestamp history. `TitlePlayers` snapshots the resume position only after a playback selection, validates iframe events, and supplies supported iframe start parameters. `AddonPlayer` restores native position and records only after playing, flushing before teardown. The buffering logo uses actual playable-buffer coverage and a separate slow pulse; unknown progress never animates a fake fill. See [[Title Playback#Buffering Artwork]] and [[Title Playback#Playback Positions]].

## Maintenance

Update [[Configuration]] when adding settings, [[Yastream]] or [[Torrentio]] when changing request or playback behavior, and [[Troubleshooting]] for new failure states. Keep credential values in their source of truth rather than copying them into notes.

Run `npm run check` for formatting, lint, and build. Use the playback browser tests after changing media handling. Tests use a short generated test pattern, so they do not depend on third-party stream availability. Live checks should report lookup and actual playback separately.
