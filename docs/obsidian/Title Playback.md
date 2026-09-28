# Title Playback

Related: [[Architecture]], [[Add-ons]], [[Configuration]], [[Troubleshooting]].

## Navigation and Metadata

RainFlix cards, search suggestions, and More Info actions now open `/title/:mediaType/:id`. There is no preview modal or separate watch layout. `WatchPage` redirects old `/watch/...` links, preserving the selected season and episode. Old `?preview=movie-ID` links redirect too.

`TitleDetails` is shared by native TMDb titles and `/addon/:addonId/title/:type/:id`. IMDb add-on titles always resolve through built-in TMDb metadata. Custom IDs use the owning or first compatible installed metadata provider internally, then a catalog preview only when no provider exists. Provider failures show Retry rather than silently switching. Custom IDs must never be passed to the iframe URL builders.

The title uses its artwork logo when available, falling back to text on missing or broken artwork. My List, Share, and Play trailer share the title action row. Cast/company/genre links remain available. Similar titles use `RelatedCarousel`, a responsive horizontal scroll-snap row without arrow buttons; touch, trackpad, and keyboard focus can navigate it. Built-in TMDb identities can be saved and enter Continue Watching; custom add-on metadata remains memory-only.

`EpisodeList` is the first step inside the right-hand playback panel for series (below details on mobile). Season navigation and episode search stay above bounded scrolling rows. Choosing an episode replaces this view with Players; Back to episodes returns to the selection. Rows use TMDb stills/air dates or add-on thumbnails/release dates when available; missing artwork has an icon fallback. Episode descriptions stay hidden. Selecting an episode updates the route without starting playback or recording history. Search applies to the selected season and clears on season change. Movies without episode/video choices open at Players.

## Selecting Playback

`TitlePlayers` lists iframe providers and installed add-ons after episode selection. Nothing streams on title entry. Iframe provider clicks open the chosen player immediately. `AddonSources` requests source data only after a provider click. During lookup, the provider list is replaced by the pulsing title-logo loader, with no visible loading text or spinner. A Cancel stream lookup arrow aborts the lookup and restores the provider list and focus. Refreshing an existing source list also shows only the logo in the source area until the request finishes; loading labels remain available to assistive technology. Multiple results replace Players with a bounded scrollable sources view. Its Back arrow returns to Players, cancels pending lookup, and restores focus to the provider. Multiple results wait for a source click. A fresh lookup with exactly one playable result opens it directly without ever showing the stream list or its Back navigation; closing returns to Players. An external-only/blocked result, empty result, or lookup error still shows a source panel for actions/settings/retry. Refresh fetches fresh URLs. There is no automatic provider fallback.

`AddonPlayer` receives a single selected source and starts the existing MP4/HLS/WebTorrent/Stremio engine. Closing, navigating, switching providers, or changing episodes tears down the video, torrent client, HLS instance, timers, subtitle fetches, and listeners. Lookup responses, source URLs, and playback descriptors are not persisted.

Torrent mode and local-service settings stay in the pre-play source panel. Changing a mode or connecting a service never starts a transfer. Connect only requests `/settings`; a source button (or a sole-source launch after a provider click) authorizes media transfer. External launches never count as watched.

## Fullscreen

Players and the manual Play trailer button open the same edge-to-edge overlay. There is no playback header. Close and fullscreen icons auto-hide, returning on pointer/keyboard interaction or focus. Native subtitles are selected through the captions menu inside the video, not an external dropdown. Iframe controls remain owned by their provider.

RainFlix requests the Fullscreen API from the click when possible. Browser policy may deny native fullscreen after asynchronous source lookup, so a full-window overlay is always available, with a fullscreen icon for another explicit attempt. Native video attempts autoplay; browser audio policy and iframe behavior still apply.

Playback pushes a non-secret `play=1` history entry. Back, Escape/remote Back, or Close stops playback and restores title details. Refresh/Forward never restores an active stream automatically. A direct popstate listener stops media even when React coalesces rapid route transitions. The background app is inert during playback, and focus returns to the launching control.

Continue Watching records native media only after `playing`. Iframes keep the existing validated playback-message/interaction tracking. Trailers never enter Continue Watching.

## Buffering Artwork

`PlaybackLoader` displays a dim title logo with an opaque left-to-right reveal. Missing/broken logos fall back to the title text. Native MP4/HLS/torrent video uses the browser's actual contiguous buffered range ahead of the playhead, targeting up to eight seconds (or the shorter remaining duration). This is playable-buffer readiness, not total-file download progress. `canplay`/`playing` hides the indicator without inventing a 100% value; a later `waiting` event measures it again.

The whole logo has a subtle, slow double pulse over 3.6 seconds, independent of the measured fill. Waiting for metadata, unknown duration, or an iframe's initial load shows only the faint pulsing logo, never a simulated filling sweep. Reduced-motion disables the pulse and fill transitions. Cross-origin iframe buffering after initial load remains controlled by the provider.

During native add-on buffering, the video surface, built-in controls, and captions menu are hidden without unmounting or restarting the media. This prevents the browser's own loading indicator from showing through the logo overlay. Controls return when the video can play; Close/fullscreen controls and actionable error/retry messages remain available.

## Playback Positions

`src/lib/playback-progress.js` stores timestamps in seconds, keyed by title and season/episode rather than provider or stream. TMDb/IMDb identities use `rainflix:playback-progress:v1` in localStorage, bounded to 200 entries. Only the content key, position, duration, completion flag, and update time are persisted, never source URLs, credentials, or add-on responses. Custom add-on identities retain positions in bounded memory only; live channels and trailers are excluded. Installed add-ons remain session-scoped; see [[Add-ons]]. Clearing Continue Watching also clears saved positions.

Native video records only after `playing`, keeps current samples in memory, and writes at most every five seconds during playback. Pause, completed seeking, page hide/backgrounding, and player cleanup flush the final sample before media resources are destroyed. A source/provider click snapshots the saved timestamp; the next native player seeks after metadata arrives (retrying when it can play). Finished videos restart at zero. A saved position beyond the new stream's duration also restarts at zero. Different cuts/editions can still have different timelines. Browser storage is per-device and per-origin, not account sync; unavailable storage falls back to memory.

For iframes, both the exact source window and configured origin must match. Validated `PLAYER_EVENT` messages can provide timestamps after a play event; included title/episode identifiers must match the selection. Focus alone can retain the existing Continue Watching interaction behavior but never supplies a timestamp. Only supported providers receive `startAt`: VidLink, VidFast, and VidCore. Iframes without progress messages or seek support cannot guarantee cross-player resume. VidLink documents that its own saved progress may take priority over `startAt`; RainFlix does not clear provider storage or bypass iframe isolation. See [VidLink documentation](https://vidlink.pro/) and [VidFast documentation](https://vidfast.vc/); VidCore follows the supplied endpoint reference.

## Verification

Run `npm run check` and `npm run test:e2e`. The tests use deterministic media/add-on fixtures; they verify application behavior, not live provider availability. Include desktop/mobile carousel overflow, artwork fallback, native/full-window playback, single/multiple source gating, subtitles, Back/Close, and resource cleanup.
