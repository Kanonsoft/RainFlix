export function releaseRepository(config) {
  const repository = config?.downloads?.githubRepository;
  return /^[\w.-]+\/[\w.-]+$/.test(repository || "")
    ? repository
    : "Kanonsoft/RainFlix";
}

export function releaseVersion(value) {
  const match = String(value || "").match(
    /^(?:(?:rainflix|windows|android)[-_])?v?(\d+)\.(\d+)\.(\d+)(?:\+[\w.-]+)?$/i,
  );
  return match ? match.slice(1).map(Number) : null;
}
export function newerRelease(candidate, current) {
  const next = releaseVersion(candidate),
    installed = releaseVersion(current);
  if (!next || !installed) return false;
  for (let index = 0; index < 3; index++) {
    if (next[index] !== installed[index]) return next[index] > installed[index];
  }
  return false;
}

export async function platformReleases(repository, signal) {
  const response = await fetch(
    `https://api.github.com/repos/${repository}/releases/latest`,
    {
      signal,
      headers: { Accept: "application/vnd.github+json" },
      cache: "no-cache",
      credentials: "omit",
    },
  );
  if (response.status === 404) return { windows: null, android: null };
  if (!response.ok) throw new Error("Release lookup unavailable.");
  const release = await response.json();
  if (release.draft || release.prerelease)
    return { windows: null, android: null };
  const assets = Array.isArray(release.assets) ? release.assets : [];
  const windows = assets
    .filter(
      (asset) =>
        /\.exe$/i.test(asset?.name || "") &&
        !/arm64|ia32|x86(?!_64)/i.test(asset.name),
    )
    .sort(
      (a, b) =>
        Number(/x64|x86_64/i.test(b.name)) - Number(/x64|x86_64/i.test(a.name)),
    );
  const android = assets
    .filter(
      (asset) =>
        /\.apk$/i.test(asset?.name || "") &&
        !/debug|unsigned|x86|armeabi|armv7/i.test(asset.name),
    )
    .sort(
      (a, b) =>
        Number(/universal/i.test(b.name)) - Number(/universal/i.test(a.name)) ||
        Number(/arm64|aarch64/i.test(b.name)) -
          Number(/arm64|aarch64/i.test(a.name)),
    );
  function selectAsset(candidates) {
    for (const asset of candidates) {
      try {
        const url = new URL(asset.browser_download_url);
        if (
          url.protocol !== "https:" ||
          url.hostname !== "github.com" ||
          !url.pathname
            .toLowerCase()
            .startsWith(`/${repository.toLowerCase()}/releases/download/`)
        )
          continue;
        return {
          url: url.href,
          name: asset.name,
          version: release.tag_name || release.name || "",
          size:
            Number.isFinite(asset.size) && asset.size > 0
              ? `${(asset.size / 1024 / 1024).toFixed(1)} MB`
              : "",
        };
      } catch {
        /* Skip invalid asset URLs instead of displaying a broken download. */
      }
    }
    return null;
  }
  return { windows: selectAsset(windows), android: selectAsset(android) };
}
