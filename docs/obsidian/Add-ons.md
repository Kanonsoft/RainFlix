# Add-ons

Related: [[README|RainFlix Notes]], [[Architecture]], [[Configuration]].

The `/addons` route browses the experimental stremio-addons.net public directory with search, category filtering, pagination, attribution, and installed add-on controls. This is a community directory, not an exhaustive list or an official Stremio service. Its terms require attribution and restrict competing uses without written permission; review those terms before deployment.

Yastream and Torrentio are disabled by default in configuration. Their legacy adapters are retained for explicit opt-in and regression coverage. Installation is now available through any HTTP(S) or stremio manifest link. Configurable add-ons open their own configuration page; paste the resulting manifest link into RainFlix.

Installed manifests and configured addresses live in sessionStorage under `rainflix:addons:session:v1`, never localStorage or the service worker. They survive refresh in the same tab but are session-scoped. Treat configured links as credentials. Lookup responses and media URLs remain in memory only.

`src/lib/addons.js` owns installation, removal, enablement, manifest resource filtering, and generic stream/subtitle requests. Enabled stream resources matching the title/episode identity appear in the title-page player list. String and object resource declarations are supported. Multiple streams wait for source selection; a sole playable result starts after the provider click; torrents retain their file index and existing WebTorrent/Stremio/external modes. External HTTP links open the provider. Uninstalling or disabling a provider unmounts its player.

Enabled catalog add-ons contribute independent rows on Home with Browse catalog links. Installed add-on cards show management controls without individual catalog links. Dedicated `/addon/:addonId/catalog/:type/:catalogId` pages use the declared catalog extras, including search, genre, custom required fields, and skip pagination. Required fields gate requests; search-only catalogs are not fetched on Home. Filters and paging are in the hash route query so Back restores them. Catalog failures remain isolated and retryable.

`src/lib/addon-catalogs.js` normalizes catalog previews and metadata without coercing custom IDs to TMDb numbers. A bounded memory-only preview map allows catalog-only cards to open basic details. Catalog responses, preview details, and embedded media URLs are not persisted. IMDb movie/series IDs in the last route segment can resolve through TMDb's find-by-external-ID endpoint, including after refresh. Other custom IDs need a compatible metadata add-on or an in-memory catalog preview.

TMDb is always the built-in metadata source for IMDb movie/series titles. There is no metadata selector. It selects the movie or TV result according to the catalog type. Series load the selected season only and preserve IMDb-based `ttID:season:episode` stream identifiers. Failed season requests show a retry state rather than generating demo episodes. Only ordinary TMDb responses use the existing TMDb cache.

`/addon/:addonId/title/:type/:id` shares `TitleDetails` with RainFlix titles, including logos, metadata, episode selection, and players on the right. Custom IDs use the owning or first compatible metadata provider internally; if none exists, the memory-only preview is used. Failures remain retryable without automatic provider switching. Home/Manage add-ons and metadata-source controls were removed from title pages. See [[Title Playback]].

Custom video IDs are preserved exactly in stream/subtitle endpoints, including colons and slashes. Series use the metadata's videos rather than inventing episode IDs. Live TV uses the channel identity. Inline video streams belong to the metadata provider and use the same explicit-Play handling as stream endpoints. The user selects a stream provider manually; video/provider changes unmount the prior player. Custom add-on titles do not enter the TMDb-only saved/Continue Watching library. IMDb titles resolved through TMDb can use those features while persisting only ordinary TMDb metadata, never add-on responses.

Supported capabilities now include catalog, meta, stream, and subtitles supplied by the selected stream add-on. Standalone subtitle-only, addon_catalog, EPG schedules, and arbitrary remote code are not implemented. Installing add-ons augments RainFlix without replacing the TMDb catalog. Browser CORS, codecs, proxy-header requirements, and torrent peer limitations still apply.

The directory can fail independently of custom manifest installation. Add-on requests use the existing timeout/abort helper and no-store fetching. Directory instances can be reached through each entry's Details link.
