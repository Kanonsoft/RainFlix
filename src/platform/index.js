export const isDesktop = import.meta.env.MODE === "desktop";
export const isAndroid = import.meta.env.MODE === "mobile";
export const isNativeApp = isDesktop || isAndroid;

export const browserTorrentAvailable = !isNativeApp;

export function shareBaseUrl() {
  if (!isNativeApp) {
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
