---
tags: [rainflix, playback, stremio]
---

# Stremio Service

Related: [[Torrentio]], [[Configuration]], [[Architecture]], [[Troubleshooting]].

## Setup

1. Run Stremio Desktop or [Stremio Service](https://www.stremio.com/download-service) on the playback device. No debrid account is necessary for torrents.
2. In RainFlix, choose Torrentio, then select **Stremio Service** under **Torrent playback**.
3. Keep `http://127.0.0.1:11470` for the same computer, or enter your accessible service address and press **Connect**.
4. Select a source and press **Play stream**.

The connection controls are below the Stream dropdown. The address and enabled flag are remembered per device, not shared between visitors. `localhost` refers to the viewing device, so a phone cannot use a PC's service through its own localhost address. An accessible HTTPS endpoint is needed for a non-loopback service when RainFlix is served over HTTPS. Browser local-network permissions and the service's access policies still apply.

The front end remains deployable as static files. GitHub Pages does not host the torrent engine. Running the service consumes network bandwidth and disk cache; torrent transfer can include uploads. Use authorized media. No service installation or settings changes are performed by the integration.

## Protocol

- **Connect**: `GET {baseUrl}/settings`, with a five-second default timeout and no caching or cookies. A valid response contains `values.serverVersion`.
- **Play stream**: native video at `{baseUrl}/{infoHash}/{fileIdx}?tr=...`. The selected file index is preserved, including zero. An omitted index uses `-1`, matching Stremio's largest-file behavior.
- `tr` values retain the provider's validated `tracker:` and `dht:` prefixes. Service base paths are preserved.
- Source browsing, selection, and connection checks never request torrent media. No automatic source fallback occurs.
- Continue Watching updates only after `playing`.

Switching streams, episodes, servers, or providers tears down the old browser media request. RainFlix does not call `/remove`, `/removeAll`, or modify global service settings. Stremio manages its own engine lifetimes, caches, and ongoing torrent transfers; stopping browser playback is not a guarantee that the external service immediately stops all transfer.

## Connection Checks

The running local service observed during development is version `4.21.0`. Its `/settings` endpoint is readable from Stremio's own web origin but did not return CORS permission for the RainFlix origin. A failed browser fetch cannot distinguish CORS, local-network permission denial, an offline service, or other network failures.

RainFlix reports that the API check could not complete instead of declaring the service offline. Native cross-origin video does not require the same readable-fetch permission in all cases, so the failed check does not disable Play. No security flags, origin spoofing, CORS disabling, or `no-cors` JSON workarounds are used.

## Playback Limits

This connection streams the original torrent file through native browser video. It does not implement Stremio's transcoding API. HEVC, AC3/DTS audio, some containers, or other unsupported codecs may fail even though Stremio's native app plays them. Source availability and seeder activity can also prevent buffering. The default loading/buffering timeout is 60 seconds, adjustable in configuration.

On failure, Retry refreshes the sources and returns to the explicit Play action; **Open torrent** remains available. No service URL or source hash is treated as proof of successful playback.

## Verification

Automated tests use mocked service endpoints and an actual generated MP4 fixture. They cover explicit start, read-only checks, original file indexes, missing-index selection, tracker parameters, saved addresses, cancellation, blocked checks with working video, failure states, and mobile layout. These do not require a live torrent swarm or install a service.

A live check on 2026-09-18 used the Torrentio MP4 source for the openly licensed Big Buck Bunny. The service created the selected torrent engine, but reported zero peers, zero downloaded bytes, and zero download speed. The player correctly timed out after 60 seconds; live playback was not confirmed for that source. The browser media request was stopped after testing. No global service settings or existing torrents were changed.

## References

- [Official Stremio Service guide](https://blog.stremio.com/using-stremio-service/)
- [Stremio stream URL conversion](https://github.com/Stremio/stremio-core/blob/development/src/types/resource/stream.rs)
- [Stremio settings response](https://github.com/Stremio/stremio-core/blob/development/src/types/streaming_server/response.rs)
- [Stremio engine HTTP implementation](https://github.com/Stremio/enginefs/blob/master/enginefs.js)
- [Local resources and mixed content](https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Mixed_content#loading_locally_delivered_mixed-resources)
