import { useSyncExternalStore } from "react";
import { isNativeApp } from "../platform/index.js";
import { readAppSettings } from "./app-settings.js";

let ready = !isNativeApp;
let started;
const listeners = new Set();
export function useAccountStartupReady() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => ready,
  );
}
export function beginAccountStartup() {
  if (!isNativeApp) return Promise.resolve();
  if (started) return started;
  const finish = () => {
    if (ready) return;
    ready = true;
    listeners.forEach((listener) => listener());
  };
  // A stalled auth/storage/network request must never trap the app at startup.
  const deadline = window.setTimeout(finish, 30000);
  const sync = import("./account-sync.js").then(({ initializeAccountSync }) =>
    initializeAccountSync({ waitForStartup: true }),
  );
  const updates =
    readAppSettings().checkUpdates && navigator.onLine
      ? import("./app-updates.js").then(({ checkAppUpdates }) =>
          checkAppUpdates(),
        )
      : Promise.resolve();
  started = Promise.allSettled([sync, updates]).finally(() => {
    window.clearTimeout(deadline);
    finish();
  });
  return started;
}
