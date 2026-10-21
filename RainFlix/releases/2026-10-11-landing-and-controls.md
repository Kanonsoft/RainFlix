# RainFlix 1.0.0 - Windows and Android

A refreshed welcome, native playback, and a more focused catalog experience.

## Downloads

- Windows x64: `RainFlix_1.0.0_x64-setup.exe`.
- Android ARM64: `app-arm64-release.apk` (or `RainFlix_1.0.0_android-arm64.apk`).

Install over the existing app to retain device data. Android updates require
the same release signing key. The website still labels Android Coming soon;
download the APK directly from the release assets.

## Website

- Introduction header and catalog navigation now link to Downloads. Hero actions are text-only, including Open RainFlix on web.
- Featured movie backdrop behind the landing hero, with decoded carousel images and cover-first background transitions.
- Web players and trailers exit through Back or Escape without redundant fullscreen/close overlays.
- RainFlix App and Yastream free-stream labels, and one consolidated add-on empty-state message.
- Browse heading and filters align with the results' left edge.

- Introduction page with a fixed featured-title backdrop and a continuously scrolling Trending this week strip below One place. Your way. Cards use centered title logos over darkened thumbnails, without captions or a colored strip background.
- Cyan download actions beside Open RainFlix; catalog navigation stays focused on browsing.
- Blank and whitespace-only searches no longer navigate away.
- Browse heading above filters, right-side mobile navigation, and a back-to-top action.

## Windows and Android

- R startup artwork instead of a brief plain-text launch view; Android's launcher icon uses a centered R on a dark background matching the loader.
- Catalog grids render on scroll instead of mounting every row at startup. Add-on catalog requests wait until their rows enter view.
- More like this stays hidden while selecting mobile streams.
- Reduced animations uses a fixed cool charcoal background inspired by the supplied palette, without movie artwork or movement.

- Default add-ons install once; removed add-ons stay removed.
- Installing an add-on keeps the current tab; installed cards include descriptions.
- Windows starts maximized. Fullscreen preference changes apply immediately.
- Android keeps both center and bottom play/pause and seek controls.
- Windows adds dedicated five-second seek controls.
- Mobile source selection focuses the selection panel instead of leaving it below title details.
- Trailers enter fullscreen directly without a redundant fullscreen action; Android uses immersive playback around camera cutouts.
- History menus no longer offer Open in new tab.

## Verification and Limitations

The shared interface passed `npm run check` and 132 browser tests. Windows and
Android release builds completed, and the Android signature verified. Native
installation and playback still need release-device checks; browser tests do
not prove every device codec or external stream works.

Streams and torrent peers depend on external providers. Next-episode prefetch
is best-effort. Android decoding depends on the device; casting is not
implemented. Use only media you are authorized to access.

Installers are built locally. These notes do not publish GitHub Releases or deploy the website.
