# Content Recommendations

Related: [[Title Playback]], [[Architecture]], [[Configuration]].

Title pages use `src/lib/recommendations.js`, not the old genre-only `getSimilar` ordering. The More link opens `/similar/:mediaType/:id`, a full-width three-column mobile/six-column desktop grid. Additional batches load on scroll, with Retry on request failure. Cards retain the shared title routes. IMDb add-on titles resolved through TMDb use the same recommendations; custom titles without a TMDb identity omit them.

## Candidate Retrieval

`RainFlixApi.getRecommendationProfile` fetches overview, tagline, keywords, genres, original language, companies, cast and selected crew/directors from TMDb details with appended keywords and credits. TV keywords use `results`; movie keywords use `keywords`. TV creators supplement its director feature. Candidate pools combine TMDb recommendations/similar with discovery by shared keywords, companies and genre/language. Types remain movie-to-movie or series-to-series. These are public catalog requests, not add-on or media lookups.

Each batch enriches at most 24 candidates, using four workers and ten-second request deadlines. The title carousel displays the top 12. The full page continues through at most five upstream pages, deduplicating already displayed titles. Results are ranked within each batch and appended, avoiding reshuffling cards already on screen. A bounded 12-entry in-memory cache lasts ten minutes; raw TMDb metadata retains the existing configured cache policy. Navigation cancels further worker dispatch and UI updates; at most four already-dispatched metadata requests may finish/cache. Failed candidate details retain available list metadata. Complete retrieval failure shows Retry rather than unrelated demo titles.

## Ranking

`src/lib/content-similarity.js` computes log-scaled term frequencies and smoothed inverse-document frequency over the seed and eligible candidate batch, L2-normalizes vectors and calculates cosine similarity. Text includes overview, tagline and keyword names. Unicode word tokenization supports non-English text, with an English stop-word list. This is lexical similarity, not a semantic embedding model; synonyms and missing/localized metadata can still weaken plot matching.

Similarity weights: text 45%, keywords 18%, genres 12%, directors/creators 8%, cast 6%, selected crew 4%, companies 4%, original language 3%. ID-based overlap is normalized by the geometric mean of feature-set sizes. Final ranking is 88% similarity, 10% normalized Bayesian quality and a 2% TMDb recommendation/similar seed prior.

Quality is `(v * R + m * C) / (v + m)`, where `v` is vote count, `R` is average rating, `C` is the eligible batch's mean rating, and `m` is 100 for movies or 50 for series. Exclude adult entries, averages below 5, movies below 20 votes and series below 10 votes, missing artwork, the seed itself, and duplicates. These conservative fixed thresholds can omit brand-new or niche titles; they are not user-specific personalization.

References: [TMDb recommendations](https://developer.themoviedb.org/reference/movie-recommendations), [movie discovery](https://developer.themoviedb.org/reference/discover-movie), [keywords](https://developer.themoviedb.org/reference/movie-keywords).

## Verification

Title-page recommendations render a detailed ghost-card carousel while weighted metadata is being fetched. It shares the final cards' geometry and sets `aria-busy`; empty or failed results remove the section after loading. The dedicated catalog retains its retry state.

`tests/recommendations.spec.js` covers plot/metadata weighting, Bayesian confidence, quality exclusions, partial metadata, retry without fabricated results, bounded concurrency, More navigation, infinite batches and mobile/desktop overflow. Run `npm run check` and `npm run test:e2e`.
