import { useSyncExternalStore } from "react";
import { isAndroid, isNativeApp } from "../platform/index.js";

const key = "rainflix:settings:v1";
const defaults = {
  reduceAnimations: isAndroid,
  fullscreenOnStart: false,
  subtitleLanguage: "en",
  audioLanguage: "",
  skipIntro: false,
  skipOutro: false,
  introSeconds: 90,
  outroSeconds: 60,
  preloadNext: true,
  nextPreview: true,
  autoNext: true,
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
export function nativeTrackSettings(saved = {}) {
  const settings = readAppSettings();
  return {
    ...(settings.subtitleLanguage
      ? { sub: { lang: settings.subtitleLanguage, off: false } }
      : { sub: { off: true } }),
    ...(settings.audioLanguage
      ? { audio: { lang: settings.audioLanguage, off: false } }
      : {}),
    ...saved,
    skipIntro: settings.skipIntro,
    skipOutro: settings.skipOutro,
    preloadNext: settings.preloadNext,
    nextPreview: settings.nextPreview,
    autoNext: settings.autoNext,
    introSeconds: settings.introSeconds,
    outroSeconds: settings.outroSeconds,
  };
}
