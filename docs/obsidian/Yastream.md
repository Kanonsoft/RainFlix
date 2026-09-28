---
tags: [rainflix, playback, yastream]
---

# Yastream

Related: [[Configuration]], [[Architecture]], [[Troubleshooting]].

## Request Flow

The player requests streams only after Yastream is selected. It sends the current TMDb ID directly; no IMDb conversion is needed.

| RainFlix title | Stremio type | Resource ID                    |
| -------------- | ------------ | ------------------------------ |
| Movie          | `movie`      | `tmdb:{id}`                    |
| TV episode     | `series`     | `tmdb:{id}:{season}:{episode}` |

Endpoints append `/stream/{type}/{encoded-id}.json` and `/subtitles/{type}/{encoded-id}.json` to the configured base. Colons in the ID are URL-encoded. The upstream implementation accepts these TMDb formats.

Stream and subtitle lookups run independently. A subtitle failure does not prevent video playback. Changing the title, episode, provider, or retry revision cancels pending requests and destroys the old media instance.

## Playback

- HTTP(S) stream URLs appear in a compact dropdown. Duplicate URLs are removed.
- MP4 and other natively supported media use the browser video element.
- `.m3u8` URLs use a dynamically imported `hls.js` instance where supported, otherwise native HLS where available.
- HLS without a recognizable `.m3u8` URL currently depends on the browser's native format detection.
- Browser controls provide play/pause, seek, volume, and fullscreen. Playback starts on user action.
- Separate SRT and WebVTT subtitle URLs are parsed using `@plussub/srt-vtt-parser` and displayed as text cues. Embedded tracks remain available through native controls when supported.
- Continue Watching is recorded on the video's `playing` event.
- Retry refreshes the add-on response. RainFlix does not persist signed stream URLs or add-on JSON, and does not switch providers automatically.

Yastream often sets `notWebReady: true` even for HLS URLs. That flag is not proof that playback will fail, so RainFlix attempts such streams. URLs requiring explicit proxy request headers display a proxy-required message because a browser video element cannot supply them.

`externalUrl`, torrent-only, and non-HTTP entries from Yastream are not playable by this adapter. [[Torrentio]] is a separate provider supporting an existing [[Stremio Service]] or external torrent links; RainFlix itself does not implement torrent transport. Not every title has a match, and a successful lookup does not establish that its media host permits browser access. The user has confirmed Yastream playback works for supported titles.

## Source References

- [Yastream source](https://github.com/hoangtamthai/yastream)
- [Yastream add-on ID handling](https://github.com/hoangtamthai/yastream/blob/main/src/lib/addon.ts)
- [Stremio stream response](https://stremio.github.io/stremio-addon-sdk/api/responses/stream.html)
- [HLS.js](https://github.com/video-dev/hls.js)
- [Subtitle parser](https://github.com/plussub/srt-vtt-parser)
