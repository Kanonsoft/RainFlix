import { useSyncExternalStore } from "react";
import packageInfo from "../../package.json";
import { config } from "./api.js";
import { isAndroid, isNativeApp } from "../platform/index.js";
import {
  platformReleases,
  releaseRepository,
  newerRelease,
} from "./downloads.js";

let state = {
  checking: false,
  current: packageInfo.version,
  available: null,
  checkedAt: 0,
  error: "",
  published: false,
  dismissed: false,
};
let pending;
const listeners = new Set();
function publish(change) {
  state = { ...state, ...change };
  listeners.forEach((listener) => listener());
}
const subscribe = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
export function useAppUpdates() {
  return useSyncExternalStore(subscribe, () => state);
}
function dismissalKey(version) {
  return `rainflix:update-dismissed:${isAndroid ? "android" : "windows"}:${version}`;
}
export function dismissAppUpdate() {
  if (state.available) {
    try {
      localStorage.setItem(
        dismissalKey(state.available.version),
        String(Date.now()),
      );
    } catch {
      /* Optional reminder dismissal. */
    }
  }
  publish({ dismissed: true });
}
export function checkAppUpdates() {
  if (pending) return pending;
  if (!isNativeApp) return Promise.resolve();
  pending = (async () => {
    publish({ checking: true, error: "" });
    try {
      const { isTauri } = await import("@tauri-apps/api/core");
      let current = packageInfo.version;
      if (isTauri()) {
        const { getVersion } = await import("@tauri-apps/api/app");
        current = (await getVersion()) || current;
      }
      const releases = await platformReleases(
        releaseRepository(config),
        AbortSignal.timeout(10000),
      );
      const release = releases[isAndroid ? "android" : "windows"];
      const available =
        release && newerRelease(release.version, current) ? release : null;
      let dismissed = false;
      try {
        dismissed =
          available &&
          Date.now() -
            Number(localStorage.getItem(dismissalKey(available.version)) || 0) <
            86400000;
      } catch {
        /* Optional storage. */
      }
      publish({
        current,
        available,
        published: Boolean(release),
        dismissed: Boolean(dismissed),
        checkedAt: Date.now(),
      });
    } catch {
      publish({
        error: "Could not check for updates. Try again when you are online.",
      });
    } finally {
      publish({ checking: false });
    }
  })().finally(() => {
    pending = null;
  });
  return pending;
}
