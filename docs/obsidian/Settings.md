---
tags: [rainflix, settings, native]
---

# Settings

Reduced-animation mode uses a fixed solid charcoal (`#2d333b`), inspired by the cool gray reference palette. It does not display movie artwork behind pages or animate background changes. Featured-title artwork remains visible inside the carousel and transitions using a decoded-image crossfade.

Windows opens maximized by default. Changing Fullscreen on start immediately enters/exits fullscreen and saves the next-launch preference; Escape exits window fullscreen outside playback. Back-to-top respects reduced-animation settings.

Related: [[Android Native]], [[Title Playback]], [[Startup Artwork]].

Settings is available only in Windows and Android navigation at `/settings`. Web redirects this route to Home. Preferences are device-local under `rainflix:settings:v1`; add-ons and My List keep their existing storage.

- Reduced animations defaults off for both Android and Windows. Existing saved preferences remain unchanged. When enabled, it replaces the startup poster wall with the R loader, uses a solid dark ambient background (no movie image) and uses hero fades instead of diagonal reveals.
- Preferred subtitle language defaults to English; audio defaults to the source's selected track. Explicit remembered per-title track choices take precedence.
- Fullscreen on start is an opt-in Windows preference, applied on the next app launch. Escape leaves desktop fullscreen outside playback; player Escape keeps its existing exit behavior. Android playback manages orientation and fullscreen separately.
- Automatic intro/outro skipping defaults off. Native players use supported chapter markers. Legacy fallback timing values remain internal for compatibility, but their inputs and explanatory text are no longer shown in Settings.
- Next-episode prefetch, preview and automatic next default on, with separate switches. Prefetch is best effort and does not guarantee instant playback.
- Storage and cache-clear controls are no longer shown in Settings. Weekly artwork refresh and the internal cache-clear utility remain available to the application.

Implementation: `src/lib/app-settings.js`, `src/pages/SettingsPage.jsx`. Native playback receives global defaults through `nativeTrackSettings`; individual remembered tracks remain supported. The website's My List displays saved titles only; native apps retain Continue Watching and Watched views.
