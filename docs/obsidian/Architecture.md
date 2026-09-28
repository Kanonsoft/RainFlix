---
tags: [rainflix, development]
---

# Architecture

Related: [[README|RainFlix Notes]], [[Configuration]], [[Yastream]], [[Torrentio]], [[Browser WebTorrent]].

| File                                                                                           | Responsibility                                                                            |
| ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| [scripts/config.js](../../scripts/config.js)                                                   | Runtime settings and provider configuration                                               |
| [scripts/rainflix-api.js](../../scripts/rainflix-api.js)                                       | TMDb mapping/caching and iframe URL builders                                              |
| [src/lib/api.js](../../src/lib/api.js)                                                         | React access to configuration and legacy API, title routes                                |
| [src/components/PrivacyAnalytics.jsx](../../src/components/PrivacyAnalytics.jsx)               | Optional, lazy-loaded analytics client and isolated event forwarding                      |
| [src/lib/yastream.js](../../src/lib/yastream.js)                                               | Config encoding, resource URLs, abortable lookups, stream/subtitle normalization          |
| [src/lib/torrentio.js](../../src/lib/torrentio.js)                                             | IMDb resource URLs, configured manifest handling, direct/torrent source normalization     |
| [src/lib/browser-torrent.js](../../src/lib/browser-torrent.js)                                 | Browser WebTorrent mode, WebRTC magnets, file selection, progress, and lifecycle          |
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

The existing iframe builders remain in the legacy API. Optional Yastream/Torrentio adapters and installed providers appear beside title details and share native video playback. The app stays static. Browser WebTorrent is a lazy, in-tab WebRTC engine; Stremio Service handles conventional swarms; external mode leaves magnet handling to another app. RainFlix includes no transcoder or hosted torrent backend.

Analytics is outside the required application module graph. When its configuration is empty, RainFlix does not request the analytics component or an external script. Browser blocking of either optional resource must not prevent startup or interaction.

Each title/season/episode has its own player instance. Each stream selection destroys the previous video's HLS instance, listeners, timers, and text cues. Abort signals prevent late provider responses from replacing the current episode.

## Maintenance

Update [[Configuration]] when adding settings, [[Yastream]] or [[Torrentio]] when changing request or playback behavior, and [[Troubleshooting]] for new failure states. Keep credential values in their source of truth rather than copying them into notes.

Run `npm run check` for formatting, lint, and build. Use the playback browser tests after changing media handling. Tests use a short generated test pattern, so they do not depend on third-party stream availability. Live checks should report lookup and actual playback separately.
