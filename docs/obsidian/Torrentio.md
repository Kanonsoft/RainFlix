---
tags: [rainflix, playback, torrentio]
---

# Torrentio

Related: [[Configuration]], [[Architecture]], [[Yastream]], [[Stremio Service]], [[Troubleshooting]].

## Current Setup

The provider is enabled with `https://torrentio.strem.fun/sizefilter=10GB`. The user has no debrid configuration. RainFlix remains a static app and performs source lookup without starting torrent downloads or seeding.

The default mode is [[Browser WebTorrent]]. It adds the selected torrent only after **Play in browser** and can reach WebRTC peers through WS/WSS trackers. This keeps deployment static but does not reach ordinary torrent peers.

[[Stremio Service]] remains available at `http://127.0.0.1:11470` for conventional swarms. RainFlix passes a selected torrent to that service only after **Play stream**. A running service and browser-compatible media are required, but debrid is not.

**External torrent app** shows **Open torrent** and asks the browser to launch an installed magnet-link handler. The external app controls downloads, uploads, and playback. Nothing launches until the link is clicked.

## IDs and Requests

TMDb details already include `external_ids`; the mapper now exposes `imdbId`, falling back to the movie's `imdb_id`. RainFlix does not guess an IMDb ID from the title or pass numeric TMDb IDs to Torrentio.

| Title      | Request                                 |
| ---------- | --------------------------------------- |
| Movie      | `/stream/movie/tt1234567.json`          |
| TV episode | `/stream/series/tt1234567%3A1%3A2.json` |

Requests use `cache: "no-store"`, omit cookies, and cancel when the provider, title, or episode changes. Missing IDs, empty results, HTTP failures, invalid data, rate limits, and timeouts have separate messages. Torrentio does not provide a separate subtitle lookup here; subtitle URLs attached to a direct stream are supported.

## Source Types

- HTTP(S) `url`: shown in the shared native MP4/HLS player. **Play stream** must be clicked before resolving or preloading the URL, since debrid resolver links may enqueue downloads. Format/codec and CORS compatibility still depend on the browser and host.
- `infoHash` and optional `fileIdx`: shown as `[Torrent]`. Browser playback constructs a WebRTC magnet using WS/WSS trackers and preserves the requested file index. Service playback builds `/{infoHash}/{fileIdx}` with repeated `tr` parameters preserving validated `tracker:` and `dht:` sources. Missing service indexes become `-1`; zero is preserved. External magnets retain valid trackers and the optional `so` hint. Duplicate hashes with different file indexes remain separate.
- Unsupported protocols, invalid hashes, and external webpage results are ignored. No scripts or upstream HTML are injected.
- Explicit proxy-header requirements and HTTP media on HTTPS pages display an unavailable message instead of attempting unsupported playback.

If a usable direct stream is present, it is selected ahead of torrent-only results, but remains unloaded until clicked. Provider selection never falls back automatically to another provider. Continue Watching changes only after native video emits `playing`, never after source lookup or opening an external app.

## Later Configuration

Set `torrentio.manifestUrl` to a configured Torrentio manifest or configure URL that returns direct video links. `stremio://` install links are normalized to HTTPS. A nonempty override takes precedence over `baseUrl`.

No debrid account was purchased, no credentials were invented, and no streaming service was installed by Codex. A bare torrent manifest does not gain browser peers by changing the URL suffix. Browser WebTorrent requires WebRTC-compatible peers and cannot generally replace a native torrent engine for arbitrary Torrentio results.

## Verification

On 2026-09-18, the configured manifest and a stream lookup for the openly licensed Big Buck Bunny (`tt1254207`) both returned HTTP 200 with API CORS enabled. Five torrent-only results were returned; this is a lookup check, not evidence of in-page torrent playback. Automated tests use generated MP4/HLS fixtures for direct playback and never launch torrent clients.

## References

- [Torrentio source](https://github.com/TheBeastLT/torrentio-scraper)
- [Stremio stream response fields](https://stremio.github.io/stremio-addon-sdk/api/responses/stream.html)
- [WebTorrent browser transport limitations](https://webtorrent.io/faq)
