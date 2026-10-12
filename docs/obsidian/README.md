---
tags: [rainflix, index]
---

# RainFlix Notes

Open this folder as an Obsidian vault, or open the repository as a vault and navigate here. The notes use Obsidian wiki links; code links are relative to this folder.

## Start Here

- [[Source Access]]: owner's disclosure preference, privacy limits, and distribution boundaries.
- [Release instructions](../releases/RELEASING.md): build outputs, signing, publishing, and platform release notes.

- [[Windows Desktop Plan]]: Windows Tauri shell in progress, platform boundaries, storage, and development milestones.
- [[Android Native]]: Android APK builds, native player, torrent transport and install links.
- [[Settings]]: native app preferences, playback defaults and cache controls.
- [[Startup Artwork]]: bundled posters and the weekly background artwork cache.
- [[Title Playback]]: shared title pages, fullscreen playback, source selection, and trailers.
- [[Recommendations]]: weighted content similarity, quality filters and the More like this catalog.
- [[Navigation]]: Back fallbacks, scroll restoration and newest/add-on infinite catalogs.
- [[Add-ons]]: installable directory, installed add-on management, Windows website install links, storage, and supported capabilities.

- [[Configuration]]: settings, provider selection, credentials, and local commands.
- [[Downloads]]: web download page, GitHub Releases installer lookup, and publishing steps.
- [[Landing]]: featured weekly movie, trailers, discovery carousels and web section navigation.
- [[Anime]]: shared web, Windows and Android anime hero, weekly trends, recent episodes, release dates and new series.
- [[Yastream]]: request format, playback, subtitles, and limitations.
- [[Torrentio]]: IMDb matching, direct streams, and external torrent links.
- [[Browser WebTorrent]]: pure static WebRTC torrent playback and browser limits.
- [[Native Torrent Desktop]]: app-owned Windows torrent playback and current format limits.
- [[Subtitle Add-ons]]: independent subtitle providers and native/browser track loading.
- [[Stremio Service]]: no-debrid torrent playback through an existing service.
- [[Architecture]]: source files, data flow, and maintenance rules.
- [[Troubleshooting]]: lookup failures, unavailable media, and browser errors.

## Current Setup

Update: legacy Yastream and Torrentio adapters are disabled by default. Native preset registrations are documented in [[Add-ons]]. Add-ons is accessed from **Settings -> Manage add-ons** in Windows and Android, not directly from navigation. The `/addons` route remains available for private testing. See [[Add-ons]] and [[Android Native]] for current behavior; provider-specific notes describe retained optional adapters.

Installed catalogs add Home rows and filterable browse pages. Native and add-on cards open the shared title-page UI. IMDb titles use built-in TMDb metadata; custom IDs use compatible add-on metadata internally.

RainFlix uses React, Vite, and hash routes. TMDb provides the catalog and title details. Available Streams are listed on the title page; provider/source clicks open a header-free fullscreen player. Add-on registrations and My List persist on the device. Continue Watching resolves the remembered provider's stream fresh and restores supported track choices. Torrent results use browser WebTorrent on the website and native playback in the Windows app by default; Stremio Service and external torrent apps remain manual options. See [[Title Playback]] for the current flow.

Yastream uses the hosted instance at `https://yastream.tamthai.de` with the supplied KissKH and OneTouchTV configuration. No RainFlix backend is required for browser-compatible streams. The upstream add-on is still an external server dependency.

This integration is being tested locally. Optional token/proxy fields are empty; put values in [config.js](../../scripts/config.js) when needed. The notes point to configuration instead of keeping duplicate credential copies.

Torrentio preserves the supplied `sizefilter=10GB` configuration. No debrid account is configured. Torrent transfer starts only after Play. Stremio Service remains selectable at the viewing device's `http://127.0.0.1:11470`. RainFlix has no hosted torrent backend.
