---
tags: [rainflix, cache, artwork]
---

# Startup Artwork

The React wall waits for the initial cached/bundled snapshot before it mounts, so seed and cached artwork do not start two successive animations. The pre-module R/progress view shares the React loader's dimensions and colors. After the exit fade, all loader artwork and animations are unmounted; hidden poster columns no longer run throughout browsing. Android still displays the OS-required launch splash before the WebView starts.

Touch layouts use compositor-isolated ambient backgrounds, lighter blur and opacity-only hero transitions. Mobile header/navigation surfaces avoid live backdrop blur during scrolling. These optimizations keep dynamic artwork enabled and do not enable the reduced-animation preference.

Related: [[Settings]], [[Architecture]].

`src/lib/startup-artwork.js` provides fourteen bundled TMDb poster images for offline first launch. The loader reads one weekly snapshot from IndexedDB (`rainflix-startup-artwork`, `artwork`, `weekly`). Stored data contains image blobs and expiry only, not add-on responses, credentials or signed playback URLs.

The app schedules a refresh five seconds after mounting and checks again every six hours while visible. A fresh snapshot is retained for seven days; an expired snapshot is replaced with trending movie posters after at least ten images download successfully. Failure retains the previous snapshot or bundled seeds. Background means asynchronous work while RainFlix is open, not an Android background service.

Refresh does not swap the visible startup wall. Updated images appear on the next launch, avoiding a cached-to-new double load. Clearing cache invalidates pending writes and preserves personal data. Reduced-animation mode uses the simple R loader, but artwork can still refresh for later use.
