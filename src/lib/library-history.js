export function historyTitleKey(item) {
  return `${item.mediaType === "tv" || item.mediaType === "series" ? "tv" : "movie"}:${item.id}`;
}

export function episodeCounts(seasons = []) {
  if (!Array.isArray(seasons)) return [];
  return seasons
    .filter(
      (item) =>
        Number.isInteger(item?.seasonNumber) &&
        item.seasonNumber > 0 &&
        Number.isInteger(item.episodeCount) &&
        item.episodeCount > 0 &&
        item.episodeCount <= 10000,
    )
    .map(({ seasonNumber, episodeCount }) => ({ seasonNumber, episodeCount }))
    .sort((a, b) => a.seasonNumber - b.seasonNumber);
}

export function groupWatchedHistory(items) {
  const groups = new Map();
  for (const item of items
    .filter((item) => item?.id)
    .sort((a, b) => (a.watchedAt || 0) - (b.watchedAt || 0))) {
    const key = historyTitleKey(item);
    const previous = groups.get(key);
    if (item.mediaType !== "tv") {
      groups.set(key, item);
      continue;
    }
    const completed = Array.isArray(item.watchedEpisodes)
      ? item.watchedEpisodes
      : [[item.season, item.episode]];
    const episodes = new Map();
    for (const pair of [...(previous?.watchedEpisodes || []), ...completed]) {
      if (
        Array.isArray(pair) &&
        Number.isInteger(pair[0]) &&
        pair[0] >= 0 &&
        Number.isInteger(pair[1]) &&
        pair[1] > 0
      )
        episodes.set(`${pair[0]}:${pair[1]}`, pair.slice(0, 2));
    }
    groups.set(key, {
      ...previous,
      ...item,
      seasonEpisodeCounts: episodeCounts(
        item.seasonEpisodeCounts || item.seasons,
      ).length
        ? episodeCounts(item.seasonEpisodeCounts || item.seasons)
        : episodeCounts(previous?.seasonEpisodeCounts),
      watchedEpisodes: [...episodes.values()].sort(
        (a, b) => a[0] - b[0] || a[1] - b[1],
      ),
    });
  }
  return [...groups.values()]
    .sort((a, b) => (b.watchedAt || 0) - (a.watchedAt || 0))
    .slice(0, 200);
}

export function seriesFinished(item) {
  if (item.markedWatched === true) return true;
  if (item.mediaType !== "tv") return true;
  const counts = episodeCounts(item.seasonEpisodeCounts);
  if (!counts.length) return false;
  const completed = new Set(
    (item.watchedEpisodes || []).map(([s, e]) => `${s}:${e}`),
  );
  return counts.every(({ seasonNumber, episodeCount }) => {
    for (let episode = 1; episode <= episodeCount; episode++) {
      if (!completed.has(`${seasonNumber}:${episode}`)) return false;
    }
    return true;
  });
}

export function remainingEpisode(item, videos = []) {
  const completed = new Set(
    (item.watchedEpisodes || []).map(([s, e]) => `${s}:${e}`),
  );
  const candidates = [];
  for (const { seasonNumber, episodeCount } of episodeCounts(
    item.seasonEpisodeCounts,
  )) {
    for (let episode = 1; episode <= episodeCount; episode++) {
      if (!completed.has(`${seasonNumber}:${episode}`))
        candidates.push({ season: seasonNumber, episode });
    }
  }
  const next =
    candidates.find(
      (video) =>
        video.season > item.season ||
        (video.season === item.season && video.episode > item.episode),
    ) || candidates[0];
  if (!next) return null;
  const metadata = videos.find(
    (video) => video.season === next.season && video.episode === next.episode,
  );
  // Provider-defined IDs must come from metadata; only standard IMDb/TMDb IDs are constructed.
  const videoId =
    metadata?.id ||
    (/^(?:tt\d+|\d+):\d+:\d+$/.test(item.videoId || "")
      ? `${item.videoId.split(":")[0]}:${next.season}:${next.episode}`
      : undefined);
  return {
    ...next,
    videoId,
    sourceSeasonNumber: metadata?.sourceSeasonNumber,
    sourceEpisodeNumber: metadata?.sourceEpisodeNumber,
  };
}
