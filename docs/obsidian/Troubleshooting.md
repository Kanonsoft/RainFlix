---
tags: [rainflix, troubleshooting]
---

# Troubleshooting

Related: [[Configuration]], [[Yastream]], [[Torrentio]], [[Architecture]].

| Symptom                                      | Check / action                                                                                                              |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Yastream missing from Player                 | `yastream.enabled` must be `true`; reload after editing configuration                                                       |
| Changed providers but old selection remains  | A nonempty `manifestUrl` overrides the readable options                                                                     |
| No streams found                             | The selected providers may not have the title/episode or could not match it; try another title or provider                  |
| Finding streams ends in a timeout            | Retry once or increase `requestTimeoutMs`; upstream lookup may be slow                                                      |
| Yastream is busy                             | Upstream rate limit, including HTTP 200 responses carrying `retryAfter`; wait before retrying                               |
| Video cannot play after streams were found   | Check Network for media/playlist/segment failure; the URL may be expired, blocked by CORS, or use an unsupported codec      |
| Stream requires a media proxy                | Provider specified request headers that browser video cannot send; configure a supported upstream proxy and refresh streams |
| HTTP source on an HTTPS page                 | Choose an HTTPS stream; browsers may reject mixed-content media                                                             |
| Subtitle error                               | The subtitle host may block CORS or return an expired URL/unsupported format; refresh or choose another track               |
| Unwanted old player selection                | Player choices are now manual on every title visit                                                                          |
| Browser torrent waits for peers              | The swarm may have no WebRTC peers even when conventional torrent clients report seeders; choose Stremio Service            |
| Browser torrent finds a file but cannot play | Try another source or Stremio Service; the browser may not support its container, video codec, or audio codec               |
| Blank page in an ad-blocking browser         | Reload after updating RainFlix; analytics is optional and must not be part of the required startup graph                    |

## GitHub Pages Startup

If the deployed HTML contains `/src/main.jsx`, the repository source was published instead of the Vite build. In repository Settings > Pages > Build and deployment, set Source to **GitHub Actions**, then run **Deploy RainFlix to GitHub Pages** again. Do not deploy the repository root from a branch; it can overwrite the correct `dist/` artifact. The deployment workflow now checks this setting before publishing. The startup fallback shows a dark recovery screen if entry modules cannot load, but it cannot repair an incorrect hosting source.

The development server stays at `/` even inside GitHub Actions. Only builds/previews infer the Pages subfolder from `GITHUB_REPOSITORY`. Applying `/RainFlix/` to the development server breaks test-only root imports and WebTorrent fixtures. Run `npm run test:pages` to build and test the actual production bundle under `/RainFlix/`; the CI smoke job runs this after the development tests.

## Torrentio

- **Only Open torrent appears:** change **Torrent playback** from External to Browser WebTorrent or Stremio Service.
- **Browser mode times out on metadata:** no reachable WebRTC peer supplied the torrent metadata. Conventional seed counts do not prove browser availability.
- **Browser mode starts but does not decode:** the torrent container or codecs are unsupported by native browser video. Browser mode does not transcode.
- **IMDb match missing:** TMDb did not supply an IMDb ID. RainFlix does not send an incorrect TMDb ID to Torrentio.
- **Several sources appear:** choose a source before playback. A provider with one playable source opens directly. Settings changes and Connect never start a torrent; click a source after configuring it.
- **Configured direct stream fails:** check account status, source availability, browser codec support, media CORS, and expiry. No account setup or proxy is bundled with RainFlix.

## Stremio Service

- **API check fails but Stremio is running:** the service may allow only Stremio's own origin. Browser network permissions or CORS can block `/settings`; try Play because native media access can still work. RainFlix does not equate a blocked check with an offline service.
- **Video times out:** confirm the address and service, then source peers and codec support. This integration does not invoke Stremio's transcoding API. Try a compatible source or Open torrent.
- **Works on PC but not phone:** localhost refers to each viewing device. Configure an accessible service address for that device; HTTPS pages require HTTPS for non-loopback addresses.
- **Editing config seems ignored:** the per-device address and checkbox override defaults. Update them in the UI or remove `rainflix:stremio-service:v1` from browser storage.
- **Browser asks for local-network access:** allow access only for the RainFlix origin you trust. Do not disable browser security globally.

## Fullscreen and Title Pages

See [[Title Playback]] for the current layout. Old watch and preview URLs redirect to the shared title page. Native fullscreen may be denied after asynchronous lookup; the edge-to-edge window player still works. Subtitle options are inside the native player captions menu. Close/Back stops playback; Refresh and Forward never auto-resume it. Trailer playback is separate from Continue Watching.

## Browser Checks

Open DevTools > Network and select Yastream. A successful `/stream/...json` response should contain a `streams` array. Then inspect the selected media URL and, for HLS, its playlists, segments, and keys. API CORS headers do not establish media CORS access.

With empty analytics settings, no RainFlix analytics module or external analytics script should be requested. When analytics is configured, blocking its lazy component or external script disables tracking only; catalog, search, library, and playback navigation remain available.

The retry button requests fresh data and restarts playback from the beginning. RainFlix does not bypass browser CORS using `no-cors`; that produces an unreadable response.

## Local Verification

```sh
npm run check
npm run test:e2e
```

Automated tests use local media fixtures and mocked add-on responses. They verify RainFlix behavior independently from live provider availability. A live stream may still need an upstream proxy or a different codec; record that limitation separately from a passing local test.

### Live Check: 2026-09-18

The supplied configuration resolved two HLS streams for TMDb series `93405`, season 1, episode 1: KissKH and OneTouchTV. Neither reached playable video in the local Chromium check. Media requests to `hls07.streamingvideofaster1.site` and `uk.8273671.online` failed with `net::ERR_FAILED`. That error alone does not establish whether the cause is CORS, network access, or an upstream failure.

The 13 automated browser tests passed, including real playback of local MP4/HLS fixtures and SRT captions. This verifies the integration independently; it does not guarantee the hosted provider's media will work. Retry or select an existing iframe player manually when a source is unavailable.

The user subsequently confirmed Yastream works for supported titles. Missing matches are expected for titles outside those providers' catalogs; the failed sample above is not a blanket availability result.
