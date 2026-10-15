import { useSyncExternalStore } from "react";
import { config } from "./api.js";
import { addonRegistrations } from "./addon-storage.js";
import { nativeAuthRedirect, parseAccountCallback } from "./account-oauth.js";
import {
  readSyncData,
  captureChanges,
  mergeSyncRecords,
  writeSyncData,
  defaultSyncOptions,
  selectedSyncRecords,
  syncRecordSelected,
  syncValuesEqual,
} from "./sync-data.js";

let clientPromise;
let running;
let activeUser;
let baseline = {};
let journal = {};
let enabled = false;
let acknowledged = {};
let needsAddonRestore = false;
let startupRestoring = false;
function guestSyncOptions() {
  try {
    return {
      ...defaultSyncOptions,
      ...JSON.parse(
        localStorage.getItem("rainflix:sync-options:guest") || "{}",
      ),
    };
  } catch {
    return { ...defaultSyncOptions };
  }
}
let options = guestSyncOptions();
let epoch = 0;
let callbackRunning = false;
let state = {
  user: null,
  busy: false,
  syncing: false,
  enabled: false,
  error: "",
  lastSync: null,
  options,
};
const listeners = new Set();
const configured = Boolean(
  config.account?.url && config.account?.publishableKey,
);
function publish(change) {
  state = { ...state, ...change };
  listeners.forEach((listener) => listener());
}
export function useAccount() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => state,
  );
}
export const accountConfigured = configured;
async function authStorageGet(key) {
  return (await addonRegistrations(undefined, `auth:${key}`))[0] || null;
}
function client() {
  if (!configured) throw new Error("Account sync has not been configured.");
  clientPromise ||= import("@supabase/supabase-js").then(({ createClient }) =>
    createClient(config.account.url, config.account.publishableKey, {
      auth: {
        flowType: "pkce",
        detectSessionInUrl: false,
        storage: {
          getItem: authStorageGet,
          setItem: (key, value) => addonRegistrations([value], `auth:${key}`),
          removeItem: (key) => addonRegistrations([], `auth:${key}`),
        },
      },
    }),
  );
  return clientPromise;
}
function journalKey() {
  return `rainflix:sync:${activeUser}:v1`;
}
function saveJournal() {
  localStorage.setItem(
    journalKey(),
    JSON.stringify({ enabled, journal, baseline, options }),
  );
}
function capture() {
  const current = readSyncData(localStorage);
  const selected = selectedSyncRecords(current, options);
  const previous = selectedSyncRecords(baseline, options);
  for (const key of Object.keys(selected))
    if (!journal[key]) delete previous[key];
  const before = journal;
  journal = captureChanges(journal, previous, selected);
  const changed = Object.keys(journal).some(
    (key) => before[key] !== journal[key],
  );
  baseline = {
    ...Object.fromEntries(
      Object.entries(baseline).filter(
        ([key]) => !syncRecordSelected(key, options),
      ),
    ),
    ...selected,
  };
  saveJournal();
  return changed;
}
function setUser(user) {
  if (activeUser === user?.id) {
    publish({ user });
    return;
  }
  epoch += 1;
  acknowledged = {};
  const guestOptions = activeUser ? null : options;
  activeUser = user?.id;
  enabled = false;
  baseline = readSyncData(localStorage);
  journal = {};
  options = { ...defaultSyncOptions, ...(guestOptions || {}) };
  if (activeUser) {
    try {
      const saved = JSON.parse(localStorage.getItem(journalKey()) || "null");
      if (saved) {
        journal = saved.journal || {};
        baseline = saved.baseline || baseline;
        options = { ...defaultSyncOptions, ...saved.options };
      }
      localStorage.setItem("rainflix:sync-owner:v1", activeUser);
    } catch {
      /* Sync is optional when storage is unavailable. */
    }
  }
  enabled = Boolean(activeUser);
  publish({ user, enabled, options, error: "", lastSync: null });
  if (activeUser && !startupRestoring) {
    // Leave Supabase's auth callback before making authenticated sync requests.
    window.setTimeout(() => {
      if (activeUser === user.id)
        void enableAccountSync().catch(() =>
          publish({
            error:
              "Sync could not start. Your data is still saved on this device.",
          }),
        );
    }, 0);
  }
}
export function saveSyncOptions(change) {
  options = {
    ...options,
    ...Object.fromEntries(
      Object.entries(change).filter(
        ([key, value]) =>
          key in defaultSyncOptions && typeof value === "boolean",
      ),
    ),
  };
  epoch += 1;
  if (activeUser) saveJournal();
  else
    localStorage.setItem(
      "rainflix:sync-options:guest",
      JSON.stringify(options),
    );
  publish({ options });
  window.dispatchEvent(
    new CustomEvent("rainflix:personal-data-changed", {
      detail: { kind: "options" },
    }),
  );
}
function webRedirect() {
  return new URL(import.meta.env.BASE_URL, window.location.origin).href;
}
export async function signInWithGoogle() {
  const { isTauri } = await import("@tauri-apps/api/core");
  const attempt = [...crypto.getRandomValues(new Uint8Array(32))]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
  const redirect = new URL(isTauri() ? nativeAuthRedirect : webRedirect());
  redirect.searchParams.set("attempt", attempt);
  if (!isTauri()) redirect.hash = "/settings/account";
  await addonRegistrations(
    [{ attempt, createdAt: Date.now() }],
    "auth:pending-oauth",
  );
  publish({ busy: true, error: "" });
  try {
    const { data, error } = await (
      await client()
    ).auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: redirect.href,
        skipBrowserRedirect: true,
        queryParams: { prompt: "select_account" },
      },
    });
    if (error || !data.url)
      throw error || new Error("Missing authorization URL.");
    const target = new URL(data.url);
    if (
      target.origin !== new URL(config.account.url).origin ||
      target.pathname !== "/auth/v1/authorize"
    )
      throw new Error("Invalid authorization destination.");
    if (isTauri()) {
      const { openUrl } = await import("@tauri-apps/plugin-opener");
      await openUrl(target.href);
    } else window.location.assign(target.href);
  } catch (error) {
    await addonRegistrations([], "auth:pending-oauth");
    throw error;
  } finally {
    publish({ busy: false });
  }
}
export async function receiveAccountCallback(address) {
  const callback = parseAccountCallback(address, webRedirect());
  if (!callback) return false;
  if (callbackRunning) return true;
  callbackRunning = true;
  try {
    const [pending] = await addonRegistrations(undefined, "auth:pending-oauth");
    if (
      !pending ||
      pending.attempt !== callback.attempt ||
      Date.now() - pending.createdAt > 600000 ||
      pending.createdAt > Date.now() + 300000
    )
      throw new Error("Sign-in expired.");
    if (callback.error) throw new Error("Sign-in canceled.");
    const { data, error } = await (
      await client()
    ).auth.exchangeCodeForSession(callback.code);
    if (error) throw error;
    await addonRegistrations([], "auth:pending-oauth");
    setUser(data.user);
    window.location.hash = "/settings/account";
    publish({ error: "" });
  } catch {
    publish({
      error:
        "Google sign-in could not finish. Return to Settings and try again.",
    });
  } finally {
    callbackRunning = false;
  }
  return true;
}
export async function signOutAccount() {
  const previous = state.user;
  enabled = false;
  epoch += 1;
  const { error } = await (await client()).auth.signOut({ scope: "local" });
  if (error) {
    enabled = Boolean(previous);
    publish({ enabled });
    throw error;
  }
  setUser(null);
}
export function disableAccountSync() {
  enabled = false;
  epoch += 1;
  saveJournal();
  publish({ enabled: false });
}
export async function enableAccountSync() {
  if (!activeUser) throw new Error("Sign in first.");
  if (!Object.keys(journal).length)
    journal = captureChanges({}, {}, readSyncData(localStorage));
  enabled = true;
  capture();
  publish({ enabled: true });
  return syncAccount();
}
export function syncAccount() {
  if (running) return running;
  if (!activeUser || !enabled || !navigator.onLine) return Promise.resolve();
  const user = activeUser;
  const generation = epoch;
  running = (async () => {
    publish({ syncing: true, error: "" });
    let stage = "device storage";
    let succeeded = false;
    try {
      capture();
      const privateKey = `sync-addons:${user}`;
      let privateState = null;
      let addonApi;
      if (options.addons) {
        addonApi = await import("./addons.js");
        const local = await addonApi.addonSyncData();
        needsAddonRestore = local === null;
        if (generation !== epoch || activeUser !== user) return;
        if (local) {
          const [saved] = await addonRegistrations(undefined, privateKey);
          privateState = saved || { journal: {}, baseline: {} };
          privateState.journal = captureChanges(
            privateState.journal,
            privateState.baseline,
            local,
            saved ? Date.now() : 1,
          );
          privateState.baseline = local;
          await addonRegistrations([privateState], privateKey);
        }
      }
      if (generation !== epoch || activeUser !== user || !enabled) return;
      stage = "account server";
      const { data, error } = await (
        await client()
      )
        .rpc("merge_rainflix_sync", {
          changes: [
            ...Object.values(selectedSyncRecords(journal, options)),
            ...Object.values(privateState?.journal || {}),
          ].filter((row) => acknowledged[row.record_key] !== row.changed_at),
        })
        .abortSignal(AbortSignal.timeout(15000));
      if (error) throw error;
      if (
        Object.keys(selectedSyncRecords(journal, options)).some(
          (key) =>
            key.startsWith("playback/") &&
            !(data || []).some((row) => row.record_key === key),
        )
      )
        throw new Error("playback-sync-migration");
      if (
        privateState &&
        Object.keys(privateState.journal).some(
          (key) => !(data || []).some((row) => row.record_key === key),
        )
      )
        throw new Error("addon-sync-migration");
      if (generation !== epoch || activeUser !== user || !enabled) return;
      stage = "applying changes on this device";
      // Capture edits made while the request was in flight before applying remote data.
      capture();
      const publicRows = (data || []).filter(
        (row) => !row.record_key.startsWith("addons/"),
      );
      journal = mergeSyncRecords(
        journal,
        publicRows.filter((row) => syncRecordSelected(row.record_key, options)),
      );
      if (privateState) {
        const local = await addonApi.addonSyncData();
        privateState.journal = captureChanges(
          privateState.journal,
          privateState.baseline,
          local || {},
        );
        privateState.journal = mergeSyncRecords(
          privateState.journal,
          (data || []).filter((row) => row.record_key.startsWith("addons/")),
        );
        await addonApi.applyAddonSyncRecords(
          privateState.journal,
          () => generation === epoch && activeUser === user && enabled,
        );
        if (generation !== epoch || activeUser !== user || !enabled) return;
        privateState.baseline = (await addonApi.addonSyncData()) || {};
        await addonRegistrations([privateState], privateKey);
      }
      writeSyncData(
        localStorage,
        journal,
        (key) => window.dispatchEvent(new StorageEvent("storage", { key })),
        options,
      );
      baseline = {
        ...Object.fromEntries(
          Object.entries(baseline).filter(
            ([key]) => !syncRecordSelected(key, options),
          ),
        ),
        ...selectedSyncRecords(readSyncData(localStorage), options),
      };
      saveJournal();
      for (const row of data || [])
        acknowledged[row.record_key] = row.changed_at;
      succeeded = true;
      publish({ lastSync: Date.now() });
    } catch (error) {
      if (generation !== epoch || activeUser !== user) return;
      publish({
        error:
          error.message === "playback-sync-migration"
            ? "Resume preferences need database migration 004. Your changes are saved on this device."
            : error.message === "addon-sync-migration"
              ? "Add-on sync needs the latest database migration. Your changes are saved on this device."
              : `Sync could not finish (${stage}${/^[A-Z0-9_]{3,20}$/.test(error.code || "") ? `; ${error.code}` : ["QuotaExceededError", "SecurityError", "AbortError", "TimeoutError", "TypeError"].includes(error.name) ? `; ${error.name}` : ""}). Your changes are saved on this device.`,
      });
    } finally {
      publish({ syncing: false });
      if (succeeded)
        window.dispatchEvent(
          new CustomEvent("rainflix:personal-data-changed", {
            detail: { kind: "settled" },
          }),
        );
    }
  })().finally(() => {
    running = null;
  });
  return running;
}
export async function initializeAccountSync({ waitForStartup = false } = {}) {
  if (!configured) return () => {};
  startupRestoring = waitForStartup;
  try {
    const supabase = await client();
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    setUser(data.session?.user || null);
    if (parseAccountCallback(window.location.href, webRedirect())) {
      const address = window.location.href;
      window.history.replaceState(
        null,
        "",
        `${window.location.pathname}#/settings/account`,
      );
      await receiveAccountCallback(address);
    }
    const { data: subscription } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUser(session?.user || null);
      },
    );
    let pending;
    let pendingAt = Infinity;
    let lastRefresh = Date.now();
    let disposed = false;
    const queue = (delay) => {
      const deadline = Date.now() + delay;
      if (deadline >= pendingAt) return;
      window.clearTimeout(pending);
      pendingAt = deadline;
      pending = window.setTimeout(() => {
        pendingAt = Infinity;
        if (enabled && !disposed) void syncAccount();
      }, delay);
    };
    const changed = async (event) => {
      if (!enabled || startupRestoring) return;
      const generation = epoch;
      try {
        capture();
        const pendingRows = Object.values(
          selectedSyncRecords(journal, options),
        ).filter((row) => acknowledged[row.record_key] !== row.changed_at);
        let needed = pendingRows.length > 0;
        if (
          ["addons", "addons-ready"].includes(event?.detail?.kind) &&
          options.addons
        ) {
          const current = await (await import("./addons.js")).addonSyncData();
          const [saved] = await addonRegistrations(
            undefined,
            `sync-addons:${activeUser}`,
          );
          needed ||=
            needsAddonRestore ||
            (current && !syncValuesEqual(current, saved?.baseline || {}));
        }
        if (disposed || generation !== epoch || !enabled) return;
        if (!needed && event?.detail?.kind !== "options") return;
        queue(
          ["progress", "settled"].includes(event?.detail?.kind) &&
            !event.detail.flush &&
            pendingRows.every((row) => row.record_key.startsWith("progress/"))
            ? 60000
            : 3000,
        );
      } catch {
        return;
      }
    };
    const refresh = () => {
      if (!enabled || document.visibilityState === "hidden") return;
      if (Date.now() - lastRefresh >= 60000) {
        lastRefresh = Date.now();
        void syncAccount();
      }
    };
    const online = () => {
      if (enabled) void syncAccount();
    };
    window.addEventListener("rainflix:personal-data-changed", changed);
    window.addEventListener("online", online);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    if (waitForStartup && activeUser && navigator.onLine) {
      await (
        await import("./addons.js")
      ).addonRestoreReady;
      await enableAccountSync();
    }
    return () => {
      disposed = true;
      window.clearTimeout(pending);
      window.removeEventListener("rainflix:personal-data-changed", changed);
      subscription.subscription.unsubscribe();
      window.removeEventListener("online", online);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  } catch {
    publish({
      error:
        "Account session could not be restored. You can still use RainFlix offline.",
    });
    return () => {};
  } finally {
    startupRestoring = false;
  }
}
