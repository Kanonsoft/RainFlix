---
tags: [rainflix, playback, torrent, webtorrent]
---

# Browser WebTorrent

Related: [[Torrentio]], [[Configuration]], [[Stremio Service]], [[Troubleshooting]].

## Behavior

**Browser (WebRTC only)** is the default Torrentio playback mode. It runs WebTorrent 3.0.21 inside the RainFlix tab and needs no local application or RainFlix backend. Source lookup does not start a transfer. The client is imported and the torrent is added only after **Play in browser** is pressed.

The player uses the Torrentio info hash and file index, keeps only WebSocket trackers that browsers can reach, and adds the configured WSS trackers. An explicit file index is preserved. Without one, RainFlix selects the largest recognized video file. Other files are deselected and requested pieces are prioritized by the native video stream.

Browser torrent traffic is peer-to-peer, so connected peers can observe the visitor's network address. Downloaded pieces can be uploaded while the player is open. Changing streams, episodes, providers, playback modes, or leaving the player destroys the client and requests deletion of its temporary browser store. Continue Watching is recorded only after the video emits `playing`.

## Static Assets

- `public/webtorrent.min.js`: vendored WebTorrent 3.0.21 browser module, loaded lazily.
- `public/webtorrent-sw.min.js`: official WebTorrent streaming worker imported by RainFlix's existing service worker.
- `public/webtorrent.LICENSE.txt`: upstream MIT license.
- `src/lib/browser-torrent.js`: mode persistence, WebRTC magnet construction, lifecycle, file selection, progress, and errors.
- `src/lib/service-worker.js`: shared registration used by app caching and browser torrent streaming.

The app remains compatible with GitHub Pages. The service worker is required for seekable streaming and is registered on the current RainFlix base path, including repository subpaths.

## Limits

Browser WebTorrent can connect only to WebRTC-capable web peers through WS/WSS trackers. Ordinary TCP/uTP peers, UDP trackers, DHT, and PEX are unavailable to browser JavaScript. A Torrentio result can therefore have many conventional seeders but zero browser peers.

Torrent metadata also has to come from a WebRTC peer or web seed. RainFlix reports a metadata timeout rather than waiting indefinitely. Playback still depends on native browser container, video codec, and audio codec support; there is no transcoding. Use [[Stremio Service]] for conventional torrent swarms or unsupported browser delivery.

## References

- [WebTorrent browser FAQ](https://webtorrent.io/faq)
- [WebTorrent API](https://github.com/webtorrent/webtorrent/blob/master/docs/api.md)
- [WebTorrent source](https://github.com/webtorrent/webtorrent)
