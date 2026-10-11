export function releaseRepository(config) {
  const repository = config?.downloads?.githubRepository;
  return /^[\w.-]+\/[\w.-]+$/.test(repository || "")
    ? repository
    : "Kanonsoft/RainFlix";
}

export async function windowsRelease(repository, signal) {
  const response = await fetch(
    `https://api.github.com/repos/${repository}/releases/latest`,
    {
      signal,
      headers: { Accept: "application/vnd.github+json" },
      cache: "no-cache",
      credentials: "omit",
    },
  );
  if (response.status === 404) return null;
  if (!response.ok) throw new Error("Release lookup unavailable.");
  const release = await response.json();
  if (release.draft || release.prerelease) return null;
  const assets = (Array.isArray(release.assets) ? release.assets : [])
    .filter(
      (asset) =>
        /\.exe$/i.test(asset?.name || "") &&
        !/arm64|ia32|x86(?!_64)/i.test(asset.name),
    )
    .sort(
      (a, b) =>
        Number(/x64|x86_64/i.test(b.name)) - Number(/x64|x86_64/i.test(a.name)),
    );
  for (const asset of assets) {
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
