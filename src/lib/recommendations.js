import { api } from "./api.js";
import { rankSimilarTitles } from "./content-similarity.js";

const cache = new Map();
function abort(signal) {
  signal?.throwIfAborted();
}
export async function contentRecommendations(
  type,
  id,
  { page = 1, signal } = {},
) {
  if (!["movie", "tv"].includes(type) || !/^[1-9]\d*$/.test(String(id)))
    throw new Error("This title is unavailable.");
  const key = `${type}:${id}:${page}`;
  abort(signal);
  const saved = cache.get(key);
  if (saved?.expires > Date.now()) return saved.feed;
  const profile = await api.getRecommendationProfile(type, id);
  abort(signal);
  const candidates = await api.getRecommendationCandidates(profile, page);
  abort(signal);
  const shortlist = rankSimilarTitles(profile, candidates.items).slice(0, 24);
  const enriched = new Array(shortlist.length);
  let index = 0;
  await Promise.all(
    Array.from({ length: Math.min(4, shortlist.length) }, async () => {
      while (index < shortlist.length) {
        abort(signal);
        const slot = index++,
          candidate = shortlist[slot];
        try {
          enriched[slot] = {
            ...candidate,
            ...(await api.getRecommendationProfile(type, candidate.id)),
          };
        } catch {
          abort(signal);
          enriched[slot] = candidate;
        }
      }
    }),
  );
  abort(signal);
  const feed = {
    title: profile,
    items: rankSimilarTitles(profile, enriched),
    page,
    hasMore: page < 5 && candidates.hasMore,
  };
  cache.set(key, { expires: Date.now() + 10 * 60 * 1000, feed });
  while (cache.size > 12) cache.delete(cache.keys().next().value);
  return feed;
}
