---
tags: [rainflix, configuration]
---

# Configuration

Related: [[README|RainFlix Notes]], [[Yastream]], [[Torrentio]], [[Troubleshooting]].

## Source of Truth

The default Yastream and Torrentio switches are now off. User-installed providers are managed through `/addons`; see [[Add-ons]].

Edit [scripts/config.js](../../scripts/config.js). Reload the app after changing settings.

| Setting                                  | Purpose                                                                                          |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `tmdbApiKey`                             | Existing TMDb metadata access                                                                    |
| `tmdbRegion`                             | Movie release region                                                                             |
| `tmdbCacheTtlMs` / `tmdbCacheMaxEntries` | Metadata cache lifetime and bound                                                                |
| `yastream.enabled`                       | Show or hide Yastream in the title-page player list                                              |
| `yastream.baseUrl`                       | Hosted add-on origin, or your own compatible instance                                            |
| `yastream.manifestUrl`                   | Optional full configured `/manifest.json` or `/configure` URL; overrides `baseUrl` and `options` |
| `yastream.requestTimeoutMs`              | Stream/subtitle lookup and subtitle file timeout; default 25000 ms                               |
| `yastream.playbackTimeoutMs`             | Time allowed for media loading or buffering before showing Retry; default 25000 ms               |
| `yastream.options.stream`                | Providers used for streams and subtitles; currently `kisskh`, `onetouchtv`                       |
| `yastream.options.catalog` / `catalogs`  | Preserved from the supplied configuration; RainFlix continues to browse TMDb                     |
| `yastream.options.info`                  | Ask the add-on for extra stream details; may slow lookup                                         |
| `yastream.options.tbKey`                 | Optional TorBox key used by upstream providers that support it                                   |
| `yastream.options.mfpUrl` / `mfpPass`    | Optional Mediaflow Proxy URL/password passed to Yastream                                         |

The adapter serializes `options` as UTF-8 JSON, Base64-encodes it, and puts it in the add-on URL. Base64 is encoding, not encryption. These runtime values are readable by the browser.

## Change Providers

1. Edit `yastream.options.stream`, or configure providers on [Yastream](https://yastream.tamthai.de/configure) and paste the resulting URL into `manifestUrl`.
2. Reload RainFlix and open a title.
3. Choose **Yastream** from **Players**; select a stream when several are available. One playable stream opens immediately.

Leave `manifestUrl` empty when using the readable `options` block. Editing `options` has no effect while an override URL is set. The original iDrama catalog selections are preserved, but iDrama is not in the selected catalog/stream provider arrays.

Adding Mediaflow settings does not automatically proxy every URL: Yastream decides which providers and links use those settings.

## Torrentio Settings

| Setting                       | Purpose                                                                                                    |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `torrentio.enabled`           | Show or hide Torrentio in Player                                                                           |
| `torrentio.baseUrl`           | Default `https://torrentio.strem.fun/sizefilter=10GB`                                                      |
| `torrentio.manifestUrl`       | Optional configured manifest or configure URL; overrides `baseUrl`; also accepts `stremio://` install URLs |
| `torrentio.requestTimeoutMs`  | Source lookup timeout, default 25000 ms                                                                    |
| `torrentio.playbackTimeoutMs` | Direct video loading/buffering timeout, default 30000 ms                                                   |

The current Torrentio URL has no debrid credentials. Choose Torrentio to list results. Torrents can use [[Browser WebTorrent]], an existing [[Stremio Service]], or an external torrent app. A debrid configuration returning HTTP(S) streams remains another option. Selecting a source authorizes media loading. A fresh provider lookup with one playable source starts it immediately; multiple sources wait for a source click.

Configured URLs may contain account keys. Keep them only in this configuration, not in screenshots, notes, logs, or shared links. They will be readable in a deployed browser bundle, even when placed in Vite environment variables. No credentials or paid services have been added.

## Browser WebTorrent Settings

| Setting                        | Purpose                                                           |
| ------------------------------ | ----------------------------------------------------------------- |
| `webTorrent.enabled`           | Makes Browser WebTorrent the default torrent playback mode        |
| `webTorrent.metadataTimeoutMs` | Time allowed to find metadata from WebRTC peers, default 35000 ms |
| `webTorrent.playbackTimeoutMs` | Overall media loading/buffering timeout, default 75000 ms         |
| `webTorrent.maxConns`          | Maximum browser peer connections, default 40                      |
| `webTorrent.uploadLimitBps`    | Upload limit in bytes per second; `-1` means unlimited            |
| `webTorrent.trackers`          | Extra WS/WSS trackers used for browser peer discovery             |

The mode dropdown is stored under `rainflix:torrent-playback:v1`. Browser mode uses only WebRTC peers and does not make ordinary torrent peers browser-compatible. The client and transfer begin only after the authorized launch described in [[Title Playback]].

## Stremio Service Settings

| Setting                            | Purpose                                                   |
| ---------------------------------- | --------------------------------------------------------- |
| `stremioService.enabled`           | Fallback default when browser playback is disabled        |
| `stremioService.baseUrl`           | Default service address, `http://127.0.0.1:11470`         |
| `stremioService.checkTimeoutMs`    | Read-only API check timeout, default 5000 ms              |
| `stremioService.playbackTimeoutMs` | Torrent media loading/buffering timeout, default 60000 ms |

Choose **Stremio Service** from **Torrent playback** to reveal **Service address** and **Connect**. The applied address is stored on this device under `rainflix:stremio-service:v1`. Editing the draft does not apply it until Connect. Connect saves the address even if the health API cannot be read, since native video may still be accessible.

Use a complete HTTP(S) base address, optionally with a reverse-proxy path, without a username, password, query, or fragment. HTTPS RainFlix pages reject non-loopback HTTP service addresses. Localhost HTTP is allowed, but browsers may require local-network permission. RainFlix neither installs the service nor changes its configuration.

## Local Commands

```sh
npm ci
npm run dev -- --host 127.0.0.1
npm run check
npm run test:e2e
```

Player selection is manual on every title visit. The old `rainflix:player-source` preference is no longer used. Source lookup is initiated by clicking an add-on, and media starts only after source selection or a one-source result. See [[Title Playback]].
