# Anime

Shared page at `#/anime` on web, Windows and Android, with Anime immediately after Home in desktop navigation and the mobile drawer. Native title links use the existing built-in title details and add-on/native playback flow; this page does not install a new streaming provider.

The page uses the existing TMDb configuration and title routes. No MAL credentials, AniList account, proxy, or new server is required. The first version defines anime as Animation (genre 16) with Japanese original language; it does not cover all Chinese/Korean animation.

- RainFlix Anime uses Home's padded hero dimensions, with Anime immediately after Home in header/drawer navigation on all platforms. A compact desktop right sidebar ranks weekly trending titles 1-10; on mobile it stacks below Recent Episodes.
- Hero and ranked sidebar: Japanese animation filtered from the first five pages of TMDb's mixed weekly trending list, preserving provider rank. No generic-popularity fallback is labeled as weekly trending.
- Recently updated: series with airings within the last 14 calendar days, showing each title's latest recorded episode and its date, sorted newest first. This is not a stream availability feed.
- Schedule: the next recorded episode of candidate series airing in the coming week, grouped by calendar date. TMDb supplies dates, not reliable local broadcast times; no times are invented. Coverage is limited to 20 discovery candidates and their recorded next episodes, not every anime broadcast.
- New anime: series first aired within the last 90 days, newest first. The first version does not mix theatrical movie premieres into this row.

Recent and New sections use responsive pagination, with up to three TMDb discovery pages (60 candidate series). Recent candidates are hydrated with latest episode dates and sorted newest-to-oldest before pagination; New uses provider first-air-date order. Pagination does not imply exhaustive coverage of all anime. Duplicate IDs are removed across discovery pages. Both page controls retain their position and disable at the boundaries.

Rows below the hero mount on scroll using ViewportCatalog. Failures expose Retry and empty dates show a quiet empty state. Results use the existing TMDb metadata cache. Title logos load through the shared helper, and hero changes update the existing fixed backdrop. Cards/episode links go to built-in TMDb title pages, preserving series/season/episode identifiers; they do not introduce playback providers or claim new stream availability.

Source modules: `scripts/rainflix-api.js` (`getAnimeFeed`), `src/pages/AnimePage.jsx`, `src/components/Header.jsx`, `src/App.jsx`.

Related: [[Architecture]], [[Configuration]], [[Title Playback]].

Responsive layout: Recent Episodes and New Anime show nine titles per page below 1024px (three columns). Desktop Recent Episodes uses ten titles in five columns; full-width New Anime uses twelve in six columns. Crossing the breakpoint resets pagination to page one. Only Recent Episodes shares the desktop row with the ranking sidebar. Continue Watching remains on Home. History currently omits genre and original-language metadata, so there is no anime-specific history filter yet.

Paged grids retain their full row/column footprint on shorter last pages using invisible, non-interactive skeleton slots. Recent-episode slots also reserve the date line. Loading uses the same grid dimensions, so section height and pagination controls do not jump when data arrives.

Browse no longer offers Anime as a type on any platform. Anime discovery is through the dedicated Anime page. The previous `getAnimeBrowse` keyword adapter is retained internally but is not used by Browse. Schedule remains an episode schedule: upcoming theatrical movies are not included.

Explicit-content filtering: all anime feeds reject adult flags and explicit title markers. Discovery excludes exact hentai/pornography keywords, and candidate details are checked with appended keywords before displaying cards. Failed detail checks omit the title. This also applies to cached discovery results and trending, which has no server-side adult toggle. TMDb misclassifications or missing keywords may still escape filtering; this is not a parental-control guarantee. Boys' Love and Girls' Love are not treated as inherently adult categories.
