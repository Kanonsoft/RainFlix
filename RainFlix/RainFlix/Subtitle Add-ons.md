---
tags: [rainflix, addons, subtitles, playback]
---

# Subtitle Add-ons

Related: [[Add-ons]], [[Title Playback]], [[Native Torrent Desktop]].

After a stream is selected, RainFlix queries all enabled installed add-ons with a matching `subtitles` resource, type and ID prefix. This includes subtitle-only add-ons, not just the chosen streaming provider. Movie requests use the IMDb/custom title ID; series requests use the exact episode ID. Stream-supplied filename, OpenSubtitles hash and file size are passed as extras when available, following the [Stremio subtitle request contract](https://github.com/Stremio/stremio-addon-sdk/blob/master/docs/api/requests/defineSubtitlesHandler.md). No hash is guessed or equated with a torrent info hash. Providers requiring unavailable file hints or another identifier may return no results.

Results include provider names and readable language labels. Inline subtitles and provider subtitles are merged and deduplicated by URL. One failed provider does not suppress successful results. Requests are canceled on source/title/episode changes. No subtitle files are downloaded before playback or before the user chooses a subtitle, except restoration of a previously selected external subtitle after video starts.

Subtitle choices are grouped by readable language. The native menu shows Off and an alphabetically ordered language list with track counts; choosing a language opens its embedded and add-on variants without selecting or downloading one. A Languages back control returns to the list. Variants retain titles, embedded/external origin, codec, SDH and forced flags. English ISO aliases share a group; Simplified and Traditional Chinese remain separate. Arrow keys, wheel and page buttons navigate the active language/variant list. The website shows the same grouping as language headings, preserving each provider option and a separate Off button.

On the website, SRT/VTT captions use the existing browser track parser and require usable CORS headers. On Windows, compatible HTTP sources and torrents share the native mpv UI. Subtitle choices enter the same menu as embedded tracks. Choosing a result downloads at most 4 MiB with a ten-second request timeout, stores it temporarily inside the owned player directory, and uses [mpv's `sub-add` command](https://mpv.io/manual/stable/#command-interface-sub-add). SRT, VTT, ASS/SSA and compatible plain subtitle files can be decoded by mpv; ZIP archives are not unpacked. Signed URLs and complete responses remain in memory. Native menu metadata contains only opaque IDs, labels and languages. Files are deleted with the playback session.

Concurrent selections use request tokens so a late download cannot replace a newer choice. External subtitle preferences store only language/title and are matched to freshly resolved options during resume. Embedded tracks remain available even when an add-on fails. Authenticated, incompatible, unavailable or incorrectly timed subtitles can still fail; subtitle delay remains adjustable in the player.

Verification: `tests/subtitle-addons.spec.js` checks episode IDs, optional file hints, independent subtitle providers, selection-only downloads and failure isolation. `tests/native-playback-bridge.spec.js` uses a mocked Tauri bridge to verify native HTTP routing, subtitle handoff, URL-free menu metadata and cleanup. Native render smoke covers decoded video, track menus, initial-only backdrop and measured fill; it does not validate live subtitle providers or live P2P availability.
