import "../../scripts/config.js";
import "../../scripts/rainflix-api.js";

export const api = window.RainFlixApi;
export const config = window.RAINFLIX_CONFIG;
export const TELEMETRY_EVENT = "rainflix:telemetry";

if (!api) {
  throw new Error("RainFlix API failed to initialize.");
}

export function trackEvent(name, data) {
  if (!name) {
    return;
  }

  try {
    window.dispatchEvent(
      new CustomEvent(TELEMETRY_EVENT, {
        detail: { data, name },
      }),
    );
  } catch {
    // Optional telemetry must never interrupt the application.
  }
}

export function watchPath(item, season = 1, episode = 1) {
  const mediaType = api.normalizeMediaType(item?.mediaType);
  const id = String(item?.id || "").trim();

  if (!id) {
    return "/home";
  }

  const path = `/title/${encodeURIComponent(mediaType)}/${encodeURIComponent(id)}`;
  return mediaType === "tv"
    ? `${path}?season=${Math.max(1, Number.parseInt(season, 10) || 1)}&episode=${Math.max(1, Number.parseInt(episode, 10) || 1)}`
    : path;
}

export function imageFallback(title, wide = false) {
  return api.createImageFallback(title, wide);
}

export function delay(duration) {
  return new Promise((resolve) => window.setTimeout(resolve, duration));
}

export function preloadImage(url) {
  if (!url) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const image = new Image();
    image.onload = resolve;
    image.onerror = resolve;
    image.src = url;

    if (image.complete) {
      resolve();
    }
  });
}
