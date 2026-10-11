---
tags: [rainflix, cache, artwork]
---

# Startup Artwork

Related: [[Settings]], [[Architecture]].

`src/lib/startup-artwork.js` provides fourteen bundled TMDb poster images for offline first launch. The loader reads one weekly snapshot from IndexedDB (`rainflix-startup-artwork`, `artwork`, `weekly`). Stored data contains image blobs and expiry only, not add-on responses, credentials or signed playback URLs.

The app schedules a refresh five seconds after mounting and checks again every six hours while visible. A fresh snapshot is retained for seven days; an expired snapshot is replaced with trending movie posters after at least ten images download successfully. Failure retains the previous snapshot or bundled seeds. Background means asynchronous work while RainFlix is open, not an Android background service.

Refresh does not swap the visible startup wall. Updated images appear on the next launch, avoiding a cached-to-new double load. Clearing cache invalidates pending writes and preserves personal data. Reduced-animation mode uses the simple R loader, but artwork can still refresh for later use.
