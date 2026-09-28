# RainFlix Working Notes

Start with [the Obsidian index](docs/obsidian/README.md) and follow its links for configuration, architecture, and playback troubleshooting.

- This is a React/Vite static app. Runtime configuration lives in `scripts/config.js`.
- Native and add-on cards use shared title pages, not preview modals or a separate watch layout. See [Title Playback](docs/obsidian/Title%20Playback.md). `TitlePlayers` owns fullscreen, `AddonSources` owns pre-play source selection, and `AddonPlayer` owns single-stream native playback.
- The current add-on setup is for local/private testing. Keep deployment as a separate, explicit task.
- Yastream and Torrentio use the existing TMDb catalog. Their adapters are `src/lib/yastream.js` and `src/lib/torrentio.js`; shared native playback lives in `src/components/AddonPlayer.jsx` and request/normalization helpers in `src/lib/addon-streams.js`.
- The user's saved Yastream options are readable under `RAINFLIX_CONFIG.yastream.options`. A nonempty `manifestUrl` overrides `baseUrl` and `options`.
- Torrentio uses IMDb IDs from TMDb details, not TMDb numeric IDs. Preserve torrent file indexes when deduplicating or constructing magnet links.
- The user has no debrid account. Torrentio can now use an existing Stremio Service, defaulting to `http://127.0.0.1:11470`. RainFlix stays static; do not install a server, change its settings, remove torrents, or bypass browser security as part of ordinary playback work.
- Browser WebTorrent is the default pure-static torrent mode. It starts only after Play, uses WebRTC peers and WS/WSS trackers, and must be destroyed on source/provider/episode/mode changes. See `src/lib/browser-torrent.js` and [Browser WebTorrent](docs/obsidian/Browser%20WebTorrent.md).
- Service settings live under `stremioService` and the per-device override `rainflix:stremio-service:v1`. See `src/lib/stremio-service.js` and `src/components/StremioServiceSettings.jsx`.
- No service media requests on initial rendering, settings changes, or multi-source lookup. A source click, or a sole playable result after an explicit provider click, authorizes playback. Connect only reads `/settings`. Only authorized playback may request `/{infoHash}/{fileIdx}`. Preserve tracker prefixes; an absent file index becomes `-1`, not zero.
- Stremio may block the API check through CORS while native video still works. Never claim the service is offline solely from a failed fetch; do not gate playback on this check or use an opaque response as proof of a successful check.
- Torrentio direct URLs must wait for source selection, except that the sole playable source of an explicit provider lookup starts immediately per the current UX. Resolving a debrid URL may enqueue a download. Never mark an external torrent launch as watched.
- Do not persist add-on responses, manifest credentials, or signed stream URLs in localStorage or the service worker. Retry requests fresh URLs.
- Keep provider changes manual. Continue Watching records native video only after `playing`, never after lookup, metadata loading, or focus.
- Analytics is optional and lazy-loaded only when configured. Keep it outside the required module graph so privacy tools cannot block RainFlix startup.
- When editing playback/configuration, update the linked notes so future sessions have current behavior and limitations.
- Run `npm run check`; for playback changes also run `npm run test:e2e`.
