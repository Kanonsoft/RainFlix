import "../../scripts/config.js";
import "../../scripts/rainflix-api.js";

export const api = window.RainFlixApi;
export const config = window.RAINFLIX_CONFIG;

if (!api) {
  throw new Error("RainFlix API failed to initialize.");
}

export function watchPath(item, season = 1, episode = 1) {
  const mediaType = api.normalizeMediaType(item?.mediaType);
  const id = String(item?.id || "").trim();

  if (!id) {
    return "/home";
  }

  return `/watch/${encodeURIComponent(mediaType)}/${encodeURIComponent(id)}/${Math.max(
    1,
    Number.parseInt(season, 10) || 1,
  )}/${Math.max(1, Number.parseInt(episode, 10) || 1)}`;
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
