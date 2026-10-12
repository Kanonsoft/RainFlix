import { useSyncExternalStore } from "react";
import { isNativeApp } from "../platform/index.js";

const key = "rainflix:settings:v1";
const defaults = {
  reduceAnimations: false,
  fullscreenOnStart: false,
  subtitleLanguage: "en",
  audioLanguage: "",
  skipIntro: false,
  skipOutro: false,
  preloadNext: true,
  nextPreview: true,
  autoNext: true,
  subtitleScale: 1,
  subtitlePosition: 92,
  subtitleDelay: 0,
};
let snapshot;
const webSettings = { ...defaults, reduceAnimations: false };
export function readAppSettings() {
  if (!snapshot) {
    try {
      snapshot = {
        ...defaults,
        ...JSON.parse(localStorage.getItem(key) || "{}"),
      };
    } catch {
      snapshot = { ...defaults };
    }
  }
  return isNativeApp ? snapshot : webSettings;
}
const listeners = new Set();
export function saveAppSettings(change) {
  snapshot = { ...readAppSettings(), ...change };
  try {
    localStorage.setItem(key, JSON.stringify(snapshot));
  } catch {
    /* Optional storage. */
  }
  listeners.forEach((listener) => listener());
}
const subscribe = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
export function useAppSettings() {
  return useSyncExternalStore(subscribe, readAppSettings);
}
export function savePlayerSkipSettings(tracks) {
  const settings = readAppSettings();
  const changes = {};
  for (const key of ["skipIntro", "skipOutro"]) {
    if (typeof tracks?.[key] === "boolean" && tracks[key] !== settings[key])
      changes[key] = tracks[key];
  }
  if (Object.keys(changes).length) saveAppSettings(changes);
}
export function nativeTrackSettings(saved = {}) {
  const settings = readAppSettings();
  return {
    ...(settings.subtitleLanguage
      ? { sub: { lang: settings.subtitleLanguage, off: false } }
      : { sub: { off: true } }),
    ...(settings.audioLanguage
      ? { audio: { lang: settings.audioLanguage, off: false } }
      : {}),
    scale: settings.subtitleScale,
    position: settings.subtitlePosition,
    delay: settings.subtitleDelay,
    ...saved,
    skipIntro: settings.skipIntro,
    skipOutro: settings.skipOutro,
    preloadNext: settings.preloadNext,
    nextPreview: settings.nextPreview,
    autoNext: settings.autoNext,
  };
}
