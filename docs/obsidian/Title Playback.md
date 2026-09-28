# Title Playback

Related: [[Architecture]], [[Add-ons]], [[Configuration]], [[Troubleshooting]].

## Navigation and Metadata

RainFlix cards, search suggestions, and More Info actions now open `/title/:mediaType/:id`. There is no preview modal or separate watch layout. `WatchPage` redirects old `/watch/...` links, preserving the selected season and episode. Old `?preview=movie-ID` links redirect too.

`TitleDetails` is shared by native TMDb titles and `/addon/:addonId/title/:type/:id`. IMDb add-on titles always resolve through built-in TMDb metadata. Custom IDs use the owning or first compatible installed metadata provider internally, then a catalog preview only when no provider exists. Provider failures show Retry rather than silently switching. Custom IDs must never be passed to the iframe URL builders.

The title uses its artwork logo when available, falling back to text on missing or broken artwork. My List, Share, and Play trailer share the title action row. Cast/company/genre links remain available. Similar titles use `RelatedCarousel`, a responsive horizontal scroll-snap row without arrow buttons; touch, trackpad, and keyboard focus can navigate it. Built-in TMDb identities can be saved and enter Continue Watching; custom add-on metadata remains memory-only.

`EpisodeList` is the first step inside the right-hand playback panel for series (below details on mobile). Season navigation and episode search stay above bounded scrolling rows. Choosing an episode replaces this view with Players; Back to episodes returns to the selection. Rows use TMDb stills/air dates or add-on thumbnails/release dates when available; missing artwork has an icon fallback. Episode descriptions stay hidden. Selecting an episode updates the route without starting playback or recording history. Search applies to the selected season and clears on season change. Movies without episode/video choices open at Players.

## Selecting Playback

`TitlePlayers` lists iframe providers and installed add-ons after episode selection. Nothing streams on title entry. Iframe provider clicks open the chosen player immediately. `AddonSources` requests source data only after a provider click, showing lookup progress in that provider's row. Multiple results replace Players with a bounded scrollable sources view. Its Back arrow returns to Players, cancels pending lookup, and restores focus to the provider. Multiple results wait for a source click. A fresh lookup with exactly one playable result opens it directly without ever showing the stream list or its Back navigation; closing returns to Players. An external-only/blocked result, empty result, or lookup error still shows a source panel for actions/settings/retry. Refresh fetches fresh URLs. There is no automatic provider fallback.

`AddonPlayer` receives a single selected source and starts the existing MP4/HLS/WebTorrent/Stremio engine. Closing, navigating, switching providers, or changing episodes tears down the video, torrent client, HLS instance, timers, subtitle fetches, and listeners. Lookup responses, source URLs, and playback descriptors are not persisted.

Torrent mode and local-service settings stay in the pre-play source panel. Changing a mode or connecting a service never starts a transfer. Connect only requests `/settings`; a source button (or a sole-source launch after a provider click) authorizes media transfer. External launches never count as watched.

## Fullscreen

Players and the manual Play trailer button open the same edge-to-edge overlay. There is no playback header. Close and fullscreen icons auto-hide, returning on pointer/keyboard interaction or focus. Native subtitles are selected through the captions menu inside the video, not an external dropdown. Iframe controls remain owned by their provider.

RainFlix requests the Fullscreen API from the click when possible. Browser policy may deny native fullscreen after asynchronous source lookup, so a full-window overlay is always available, with a fullscreen icon for another explicit attempt. Native video attempts autoplay; browser audio policy and iframe behavior still apply.

Playback pushes a non-secret `play=1` history entry. Back, Escape/remote Back, or Close stops playback and restores title details. Refresh/Forward never restores an active stream automatically. A direct popstate listener stops media even when React coalesces rapid route transitions. The background app is inert during playback, and focus returns to the launching control.

Continue Watching records native media only after `playing`. Iframes keep the existing validated playback-message/interaction tracking. Trailers never enter Continue Watching.

## Verification

Run `npm run check` and `npm run test:e2e`. The tests use deterministic media/add-on fixtures; they verify application behavior, not live provider availability. Include desktop/mobile carousel overflow, artwork fallback, native/full-window playback, single/multiple source gating, subtitles, Back/Close, and resource cleanup.
