---
tags: [rainflix, settings, native]
---

# Settings

The Settings index contains navigation only. Account & sync shows the signed-in email alongside its label; account controls live at `/settings/account`. Appearance, Playback and App updates have dedicated `/settings/appearance`, `/settings/playback` and `/settings/updates` pages. Add-ons and Subtitle settings retain their dedicated pages. Native Back/browser history returns to the index without adding visible routing Back buttons. Sign out uses a muted red treatment.

Reduced-animation mode uses a fixed solid charcoal (`#2d333b`), inspired by the cool gray reference palette. It does not display movie artwork behind pages or animate background changes. Featured-title artwork remains visible inside the carousel and transitions using a decoded-image crossfade.

Normal ambient movie backgrounds use the landing-page-style 38px blur on both current and outgoing image layers, including dynamic crossfades. A 48px overscan prevents blurred edges from revealing gaps. Hero/card artwork stays sharp, fixed background sizing stays stable on mobile, and reduced-animation mode keeps its solid color unchanged. This shared CSS applies to web, Windows and Android.

Ambient dimming is applied once to the image container at 25% opacity, not to each overlapping image. The outgoing image stays opaque while the incoming image fades to opaque within that container. Removing the outgoing image after the fade therefore cannot cause a bright-to-dark jump. The static reduced-animation background is excluded from this opacity rule.

In this mode the sticky header and bottom navigation share opaque `#0d1317`, at every scroll position, without blur or transitions. Manage add-ons and Subtitle settings are plain text links without icons.

Windows opens maximized by default. Changing Fullscreen on start immediately enters/exits fullscreen and saves the next-launch preference; Escape exits window fullscreen outside playback. Back-to-top respects reduced-animation settings.

Related: [[Android Native]], [[Title Playback]], [[Startup Artwork]].

Settings is available only in Windows and Android navigation at `/settings`. Web redirects this route to Home. Preferences are device-local under `rainflix:settings:v1`; add-ons and My List keep their existing storage.

Add-ons is reached through Settings -> Manage add-ons, not top/bottom navigation. Its existing `/addons` address remains compatible with protocol install links. Subtitle settings opens the dedicated native-only `/settings/subtitles` workspace with a larger preview, size/position/delay sliders and Reset. It uses the existing preference keys, so previous customizations remain intact. Back returns to Settings, including for a direct link. Reset affects only these three subtitle appearance/timing values, not languages or playback switches. The preview is a still image, so delay affects playback rather than animating preview timing.

- Reduced animations defaults off for both Android and Windows. Existing saved preferences remain unchanged. When enabled, it replaces the startup poster wall with the R loader, uses a solid dark ambient background (no movie image) and uses hero fades instead of diagonal reveals.
- Preferred subtitle language defaults to English; audio defaults to the source's selected track. Explicit remembered per-title track choices take precedence.
- Subtitle settings offers a bundled-image preview with sample text and controls for size (50-250%), vertical position (0-50% above the bottom) and delay (-10 to +10 seconds). The preview updates size and position immediately; it is a still image, not a timing simulation. These device-local defaults are passed to both native players. Remembered per-title appearance choices take precedence, like remembered languages.
- Fullscreen on start is an opt-in Windows preference, applied on the next app launch. Escape leaves desktop fullscreen outside playback; player Escape keeps its existing exit behavior. Android playback manages orientation and fullscreen separately.
- Automatic intro/outro skipping defaults off. Native players use supported chapter markers. Legacy fallback timing values remain internal for compatibility, but their inputs and explanatory text are no longer shown in Settings.
- Next-episode prefetch, preview and automatic next default on, with separate switches. Prefetch is best effort and does not guarantee instant playback.
- Player playback menus expose only auto-skip intro/outro. Separate native `settings` events update the device-wide `skipIntro`/`skipOutro` keys used by Settings; later episodes, other titles and app restarts inherit them. Preview and preload remain adjustable only in app Settings. Native `preferences` events save only title-specific track/appearance choices. Global keys are removed from legacy title preferences, so neither preference scope overwrites the other. Stale/foreign native sessions cannot update settings. Chapter safety guards still apply.
- Storage and cache-clear controls are no longer shown in Settings. Weekly artwork refresh and the internal cache-clear utility remain available to the application.

Implementation: `src/lib/app-settings.js`, `src/pages/SettingsPage.jsx`, `src/pages/SubtitleSettingsPage.jsx`. Native playback receives global defaults through `nativeTrackSettings`; individual remembered tracks remain supported. The website's My List displays saved titles only; native apps retain Continue Watching and Watched views.
