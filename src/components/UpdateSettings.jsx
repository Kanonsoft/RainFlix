import { useAppUpdates, checkAppUpdates } from "../lib/app-updates.js";
import { saveAppSettings, useAppSettings } from "../lib/app-settings.js";

export default function UpdateSettings() {
  const updates = useAppUpdates();
  const settings = useAppSettings();
  return (
    <section
      className="mt-9 border-t border-white/10 pt-6"
      aria-labelledby="updatesHeading"
    >
      <h2 id="updatesHeading" className="text-lg font-semibold text-sky-200">
        App updates
      </h2>
      <p className="mt-3 text-sm text-slate-300">
        Installed version {updates.current}
      </p>
      <label className="flex min-h-16 items-center justify-between gap-5 border-b border-white/10 py-4">
        <span>Check for updates automatically</span>
        <input
          type="checkbox"
          role="switch"
          checked={settings.checkUpdates}
          onChange={(event) =>
            saveAppSettings({ checkUpdates: event.target.checked })
          }
          className="h-5 w-9 shrink-0 accent-sky-400"
        />
      </label>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          disabled={updates.checking}
          onClick={() => void checkAppUpdates()}
          className="min-h-11 rounded border border-white/20 px-4 py-2 text-sm disabled:opacity-50"
        >
          {updates.checking ? "Checking..." : "Check for updates"}
        </button>
        {updates.available && (
          <a
            className="inline-flex min-h-11 items-center rounded bg-sky-400 px-4 py-2 text-sm font-semibold text-black"
            href={updates.available.url}
          >
            Download {updates.available.version}
          </a>
        )}
      </div>
      <p role="status" className="mt-3 text-sm text-slate-400">
        {updates.error ||
          (updates.available
            ? `Version ${updates.available.version} is available.`
            : updates.checkedAt
              ? updates.published
                ? "You are up to date."
                : "No published installer found for this device."
              : "")}
      </p>
    </section>
  );
}
