---
tags: [rainflix, settings, native]
---

# Settings

Related: [[Android Native]], [[Title Playback]], [[Startup Artwork]].

Settings is available only in Windows and Android navigation at `/settings`. Web redirects this route to Home. Preferences are device-local under `rainflix:settings:v1`; add-ons and My List keep their existing storage.

- Reduced animations defaults on for Android and off for Windows. It replaces the startup poster wall with the R loader, freezes the ambient background and uses hero fades instead of diagonal reveals.
- Preferred subtitle language defaults to English; audio defaults to the source's selected track. Explicit remembered per-title track choices take precedence.
- Automatic intro/outro skipping defaults off. Native players use supported chapter markers; Android also offers adjustable opening/ending fallback durations for episodes without markers. These are timing estimates, not scene detection, and may skip story content. Set durations to zero to disable the fallback.
- Next-episode prefetch, preview and automatic next default on, with separate switches. Prefetch is best effort and does not guarantee instant playback.
- Clear cache removes cached TMDb metadata, title logos and startup artwork. It preserves installed add-ons, My List, history and preferences; bundled seed posters remain available.

Implementation: `src/lib/app-settings.js`, `src/pages/SettingsPage.jsx`. Native playback receives global defaults through `nativeTrackSettings`; individual remembered tracks remain supported. The website's My List displays saved titles only; native apps retain Continue Watching and Watched views.
