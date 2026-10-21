# RainFlix 2.0.0 - Accounts, Cloud Sync & Improved Playback

Your library can now follow you between Windows and Android.

## Accounts & Cloud Sync

- Sign in with Google from Settings > Account & sync.
- Automatically sync My List, Continue Watching, playback progress, watched history, shared playback/subtitle preferences, and installed add-ons.
- Choose which categories to sync; everything is enabled by default.
- Sync starts automatically after sign-in, with no separate merge or enable step.
- Changes are batched instead of continuously polling while the app is idle. Ongoing playback progress is synced about once a minute, with earlier updates when playback is completed or exited.
- Local data remains available offline and after signing out.
- Fullscreen, animation, and other device-specific preferences remain local.
- Startup account sync now runs behind the existing RainFlix loading screen before the initial page is revealed. Offline or failed sync falls back to local data, with a bounded startup timeout.
- Continue Watching now syncs remembered stream/provider, quality, subtitle, and audio preferences between devices.
- Torrent resume prioritizes the previously selected file when it remains available, even when result ordering or peer counts change. Providers are matched across devices without relying on device-local registration IDs.

## Settings

- Dedicated pages for Account & sync, Appearance, Playback, Subtitle settings, and App updates.
- The signed-in email appears beside Account & sync in Settings.
- A clearer Sign out button and automatic sync without a Sync now button.
- More informative sync errors that identify the failing stage without displaying private credentials.
- Sign out stays available during syncing, and the last-sync timestamp has been removed.

## Playback

- Continue Watching cards open the title page first.
- A blue Continue watching button resumes the saved movie or episode using the remembered stream and track preferences when available.
- Improved next/previous episode transitions reuse the native player instead of briefly returning to the title page.
- Finished movies and series with no next episode return to their title page.
- Improved handling of episode metadata, track state, and playback initialization between episodes.
- Next/previous episode preparation now shows the title thumbnail and loading logo instead of holding a frozen video frame.

## Library & Discovery

- Continue Watching on Home now scrolls sideways like More like this.
- Saved titles, Continue Watching, and Watched sections in My List use the same horizontal carousel layout.
- Responsive rows show three cards on narrow mobile screens, four on small tablets, and six on desktop, while retaining right-click and long-press history actions.

## App Updates

- In-app update notices for Windows and Android when a newer compatible release is available.
- Update checks also run during the initial RainFlix loading screen alongside account sync, without trapping startup when offline or on failure.
- Automatic update checks can be managed from Settings > App updates.

## Sync Reliability

- Consolidated cloud data into one document per user, retaining conflict checks for changes made on different devices.
- Uploads send only revisions not yet acknowledged by the server.
- Prevented unchanged remote data and JSON field ordering from triggering unnecessary syncs.

## Downloads

- **Windows:** x64 installer (`.exe`).
- **Android:** signed ARM64 installer (`.apk`).

Account sync is optional. Add-on availability and playback compatibility depend on the provider, source, and device.

Remembering a torrent does not remove peer connection or buffering time. Existing titles need playback on an updated app to capture the new exact-file resume identifier.
