---
tags: [rainflix, index]
---

# RainFlix Notes

Open this folder as an Obsidian vault, or open the repository as a vault and navigate here. The notes use Obsidian wiki links; code links are relative to this folder.

## Start Here

- [[Title Playback]]: shared title pages, fullscreen playback, source selection, and trailers.
- [[Add-ons]]: current directory, installation, session storage, and supported capabilities.

- [[Configuration]]: settings, provider selection, credentials, and local commands.
- [[Yastream]]: request format, playback, subtitles, and limitations.
- [[Torrentio]]: IMDb matching, direct streams, and external torrent links.
- [[Browser WebTorrent]]: pure static WebRTC torrent playback and browser limits.
- [[Stremio Service]]: no-debrid torrent playback through an existing service.
- [[Architecture]]: source files, data flow, and maintenance rules.
- [[Troubleshooting]]: lookup failures, unavailable media, and browser errors.

## Current Setup

Update: Yastream and Torrentio are disabled by default. Use the **Add-ons** header entry to browse or install a manifest. See [[Add-ons]] for current behavior; the provider-specific notes below describe the retained optional adapters.

Installed catalogs add Home rows and filterable browse pages. Native and add-on cards open the shared title-page UI. IMDb titles use built-in TMDb metadata; custom IDs use compatible add-on metadata internally.

RainFlix uses React, Vite, and hash routes. TMDb provides the catalog and title details. Players are listed on the title page; provider/source clicks open a header-free fullscreen player. Torrentio torrents can use browser WebTorrent, an existing Stremio Service, or an external torrent app. See [[Title Playback]] for the current flow.

Yastream uses the hosted instance at `https://yastream.tamthai.de` with the supplied KissKH and OneTouchTV configuration. No RainFlix backend is required for browser-compatible streams. The upstream add-on is still an external server dependency.

This integration is being tested locally. Optional token/proxy fields are empty; put values in [config.js](../../scripts/config.js) when needed. The notes point to configuration instead of keeping duplicate credential copies.

Torrentio preserves the supplied `sizefilter=10GB` configuration. No debrid account is configured. Browser WebTorrent is the default playback mode and runs only after Play. Stremio Service remains selectable at the viewing device's `http://127.0.0.1:11470`. RainFlix has no hosted torrent backend.
