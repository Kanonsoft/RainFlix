export const isDesktop = import.meta.env.MODE === "desktop";

export const browserTorrentAvailable = !isDesktop;

export function shareBaseUrl() {
  if (!isDesktop) {
    return new URL(import.meta.env.BASE_URL, window.location.origin).href;
  }
  const configured = window.RAINFLIX_CONFIG?.publicSiteUrl;
  try {
    const url = new URL(configured);
    if (url.protocol === "https:") return url.href;
  } catch {
    // Keep sharing available if the configured public URL is missing.
  }
  return "https://kanonsoft.github.io/RainFlix/";
}
