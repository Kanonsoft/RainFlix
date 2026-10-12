const stopWords = new Set(
  "a an and are as at be been by for from has have he her his in into is it its of on or she that the their them they this to was were who will with you your".split(
    " ",
  ),
);
function terms(profile) {
  const text = `${profile.synopsis || ""} ${profile.tagline || ""} ${(profile.keywords || []).map((item) => item.name).join(" ")}`;
  const counts = new Map();
  for (const word of text
    .normalize("NFKC")
    .toLocaleLowerCase()
    .match(/[\p{L}\p{N}]+/gu) || []) {
    if (word.length < 2 || stopWords.has(word)) continue;
    counts.set(word, (counts.get(word) || 0) + 1);
  }
  return counts;
}
function vectors(profiles) {
  const documents = profiles.map(terms);
  const frequency = new Map();
  for (const document of documents)
    for (const word of document.keys())
      frequency.set(word, (frequency.get(word) || 0) + 1);
  return documents.map((document) => {
    const vector = new Map();
    let norm = 0;
    for (const [word, count] of document) {
      const weight =
        (1 + Math.log(count)) *
        (1 + Math.log((documents.length + 1) / (frequency.get(word) + 1)));
      vector.set(word, weight);
      norm += weight * weight;
    }
    if (norm)
      for (const [word, weight] of vector)
        vector.set(word, weight / Math.sqrt(norm));
    return vector;
  });
}
function overlap(left = [], right = []) {
  const ids = (items) => new Set(items.map((item) => String(item.id ?? item)));
  const a = ids(left),
    b = ids(right);
  if (!a.size || !b.size) return 0;
  return [...a].filter((id) => b.has(id)).length / Math.sqrt(a.size * b.size);
}
export function weightedRating(item, prior = 6.5, minimum = 100) {
  const votes = Math.max(0, Number(item.voteCount) || 0);
  const rating = Math.min(
    10,
    Math.max(0, Number(item.voteAverage ?? item.rating) || 0),
  );
  return (votes * rating + minimum * prior) / (votes + minimum);
}
export function rankSimilarTitles(seed, candidates) {
  const seen = new Set();
  const eligible = candidates.filter((item) => {
    const key = `${item.mediaType}:${item.id}`;
    if (
      seen.has(key) ||
      item.adult ||
      item.mediaType !== seed.mediaType ||
      String(item.id) === String(seed.id) ||
      !((Number(item.voteCount) || 0) >= (seed.mediaType === "tv" ? 10 : 20)) ||
      !(Number(item.voteAverage ?? item.rating) >= 5) ||
      !(item.poster || item.backdrop)
    )
      return false;
    seen.add(key);
    return true;
  });
  const prior = eligible.length
    ? eligible.reduce(
        (sum, item) => sum + Number(item.voteAverage ?? item.rating),
        0,
      ) / eligible.length
    : 6.5;
  const [source, ...documents] = vectors([seed, ...eligible]);
  return eligible
    .map((item, index) => {
      let text = 0;
      for (const [word, weight] of source)
        text += weight * (documents[index].get(word) || 0);
      const similarity =
        0.45 * text +
        0.18 * overlap(seed.keywords, item.keywords) +
        0.12 * overlap(seed.genreIds, item.genreIds) +
        0.08 * overlap(seed.directors, item.directors) +
        0.06 * overlap(seed.cast, item.cast) +
        0.04 * overlap(seed.crew, item.crew) +
        0.04 * overlap(seed.companies, item.companies) +
        0.03 *
          Number(
            Boolean(seed.originalLanguage) &&
              seed.originalLanguage === item.originalLanguage,
          );
      const quality = weightedRating(
        item,
        prior,
        seed.mediaType === "tv" ? 50 : 100,
      );
      return {
        ...item,
        similarityScore:
          0.88 * similarity +
          (0.1 * quality) / 10 +
          0.02 * Number(Boolean(item.recommendationSeed)),
        weightedRating: quality,
      };
    })
    .sort(
      (a, b) =>
        b.similarityScore - a.similarityScore ||
        b.voteCount - a.voteCount ||
        Number(a.id) - Number(b.id),
    );
}
