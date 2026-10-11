---
tags: [rainflix, android, playback, torrent]
---

# Android Native

Launcher and Android 12+ launch screens reference the transparent bundled R drawable, not a text title. The HTML pre-module fallback also shows R with an animated progress bar; failure messages and Reload remain available if startup fails. Android launchers may still impose their own icon mask/background. The catalog uses its dark launch theme to prevent a light flash before the React loader mounts.

Related: [[Title Playback]], [[Native Torrent Desktop]], [[Add-ons]], [[Downloads]].

The Android Tauri build shares the React catalog, title pages, add-on installation, My List and Continue Watching with Windows. Vite's `mobile` mode writes `dist-mobile`; app navigation includes Add-ons and hides the website download action. The Windows mpv executable and named-pipe code are excluded from Android builds.

## Playback

The Android controls follow the desktop visual hierarchy: title/back at the top, a circular-thumb seek bar below, icon actions for playback speed, audio, subtitles and episodes, and a right-side season/provider/stream drawer. Mobile adds centered touch controls and uses hardware volume keys. Touch targets are at least 48dp. Track panels are dark, dismiss outside, and use readable language names. This is shared styling and behavior where supported, not identical mpv capabilities. Main catalog content respects system-bar and display-cutout insets; trailer/frame playback temporarily requests landscape and restores portrait on close.

Mobile cards fit three columns, with compact metadata. Search/browse pagination uses an IntersectionObserver and ghost cards; failed subsequent pages expose Retry instead of an automatic retry loop. Text search now retains TMDb page counts and fetches subsequent result pages. The startup fallback keeps error recovery but does not flash a Starting RainFlix message. Stream lookup uses neutral placeholders rather than a second title-logo loader.

`src-tauri/plugins/native-player` supplies an in-app landscape Android Activity using AndroidX Media3 ExoPlayer. Selecting an authorized stream opens it immediately, showing title artwork, the title logo (or the bundled RainFlix R), and horizontal startup buffer progress. Torrent metadata may still take up to 75 seconds. Back returns to RainFlix; audio is paused when leaving the player for another app. Playback does not use Stremio Service or a separate video app.

The player provides pause, seek, playback speed, language-grouped embedded subtitle/audio selection, add-on subtitles, and a scrollable season/episode/provider/source drawer. Native events use the existing progress and per-title preference flow; Continue Watching begins on actual playing, not lookup or metadata readiness. Next/previous and EOF use the existing fresh same-provider episode resolution. Manual episode selection opens provider/source choices instead. URLs and responses remain in memory, not history storage.

Mobile controls put transparent play/pause and five-second seek actions in the center. A first background tap reveals controls; rapid repeated left/right taps seek in five-second increments with a cumulative indicator. Title/back visibility follows the same controller timer. Volume uses Android's hardware buttons, not a player slider. Audio/subtitle panels show languages first, then that language's embedded and add-on variants. Subtitle appearance offers size, bottom padding, background and embedded styling; explicit positioning in embedded ASS cues may override bottom padding. Appearance choices travel through the existing per-title preferences. The episode drawer has no search field and dismisses on an outside tap. Provider rows use add-on logos with an R fallback; source rows separate headings, quality badges and full release details with dividers.

Android decoding uses the device's supported codecs with decoder fallback. MP4, WebM, supported MKV tracks, HLS and DASH are supported by Media3, but this is not the Windows bundled mpv/FFmpeg codec set. DRM, unavailable peers, unsupported device codecs, unusual containers, request-header requirements and live add-on failures can still prevent playback. Casting is not implemented. Do not describe the builds as full feature parity.

Buffering uses a single horizontal indicator: animated indeterminate progress during metadata discovery, then measured progress toward five seconds of buffered media. No secondary circle spinner is shown. Intro/outro actions use supported ID3 chapter markers or configurable episode timing fallbacks; automatic skipping is off by default. Settings controls skipping, preview, prefetch and automatic next. The next-episode card appears in the last 45 seconds when the next episode is known.

Android torrent prefetch starts after current playback is ready with five seconds buffered. Shared episode resolution keeps the same provider and matching release preferences. A separate low-priority torrent reads up to 4 MiB at the beginning and 512 KiB at the end, then pauses. This is byte prefetch, not a promise of five decoded seconds. Handoff requires the same magnet and file index; unavailable peers or a failed handoff use fresh playback. Unclaimed warm sessions expire after two hours and claimed handoffs after 90 seconds. Player exit/background cancels unclaimed prefetch. No background Android torrent service is installed.

`src-tauri/src/android_torrent.rs` embeds librqbit with Rust TLS. It selects only the requested file (preserving zero-based indexes) or the largest recognized video. Normal BitTorrent TCP/UDP peers and DHT are supported. A tokenized read-only GET/HEAD byte-range endpoint binds only to loopback. One session is active; replacement waits for cancellation/cleanup. Temporary files are owned by UUID-named playback folders under app cache; normal stop removes them. Crash cleanup is not yet implemented. Metadata/storage initialization have bounded deadlines, files are capped at 12 GiB, peers at 40, and upload at 256 KiB/s. Playback should be foreground-only; there is no background torrent service.

## Install Links

Mobile listeners must deserialize a typed `tauri::ipc::Channel<Value>` in the Rust `register_listener` command before forwarding it to Kotlin. Forwarding only the raw JSON callback identifier does not register Tauri's mobile channel, silently dropping playback/close/install-link events and eventually triggering the frontend startup timeout even while video plays.

The main Activity declares `stremio://` and `rainflix://` intent filters. The native plugin validates a provider-independent HTTP-style host and `/manifest.json` path, rejects credentials/fragments and keeps the incoming link in memory. Cold and warm links open Add-ons with the manifest filled in; the user must still press Install. No configured manifest URL is logged or written to the route. Android chooses the handler: if Stremio is installed or already set as default, the user must choose RainFlix or clear that association themselves. RainFlix does not override another app's defaults.

## Build

Release builds must include Android's `proguard-android-optimize.txt` defaults and the Jackson enum reflection rules in `app/proguard-rules.pro`. Without these, R8 removes `SerializationFeature.values()`, causing Tauri's PluginManager/ObjectMapper initialization to crash before React starts. Debug builds do not reproduce this because minification is disabled. Always verify a signed release launch as well as debug playback.

1. Install Android Studio, SDK platform/build tools 36, NDK and Rust Android targets.
2. Run `npm run android:init` only for initial project setup. The checked-in Android project includes custom configuration; do not regenerate it over edits.
3. Run `npm run android:build` for a signed ARM64 release APK, or `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/android.ps1 -Action build -Debug` for device verification.
4. APKs are under `src-tauri/gen/android/app/build/outputs/apk/arm64/`.

The helper discovers Android Studio's JBR and installed NDK without changing persistent environment variables. On Windows without symlink permission it copies the successfully compiled native library and runs Gradle with that already-built Rust task excluded; it does not enable Developer Mode or elevate permissions. First builds can download substantial Rust/Gradle dependencies.

Release signing creates a private local `rainflix-release.jks` and `keystore.properties` on the first release build. Back up both together for future updates; they are gitignored. Never regenerate the key for an already distributed application. This is an APK build, not a Play Store publication or website release upload.

Device verification uses an explicitly selected `adb -s <serial>` target. The user must allow installation via USB and accept the phone's install prompt. Do not clear app data, uninstall apps or change default link handlers to make tests pass.

## Device Verification

Verified on the user's Xiaomi ARM64 phone: Link Click season 1 episode 1 from installed Torrentio plays in Media3, pause shows the title logo, embedded subtitle tracks are listed, playback progress reaches the shared history store, and Back returns to the title page without leaving an empty fullscreen portal. Trailer playback switches the main Activity to landscape and restores portrait. Three-card mobile rows and single-line drawer genres were checked on-device; search pagination and mobile overflow have Playwright regression coverage. Torrent peer discovery remains variable and may still hit the metadata deadline.
