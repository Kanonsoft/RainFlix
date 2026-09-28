# Playback Fixtures

`player-sample.mp4` is a three-second FFmpeg test pattern with no third-party footage. `player-sample.m3u8` and `player-sample0.mpegts` contain the same pattern as HLS. Browser tests serve these files through request interception.

```sh
ffmpeg -f lavfi -i testsrc=size=320x180:rate=10 -t 3 -c:v libx264 -pix_fmt yuv420p -g 10 -movflags +faststart player-sample.mp4
ffmpeg -i player-sample.mp4 -c copy -hls_time 3 -hls_list_size 0 -hls_segment_filename player-sample%d.mpegts player-sample.m3u8
```
