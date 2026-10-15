import { useEffect } from "react";
import { useLocation } from "react-router";
import { X } from "lucide-react";
import {
  useAppUpdates,
  checkAppUpdates,
  dismissAppUpdate,
} from "../lib/app-updates.js";
import { useAppSettings } from "../lib/app-settings.js";

export default function AppUpdateNotice() {
  const updates = useAppUpdates();
  const settings = useAppSettings();
  const location = useLocation();
  useEffect(() => {
    if (!settings.checkUpdates) return;
    const check = () => {
      if (document.visibilityState === "visible") void checkAppUpdates();
    };
    const timer = !updates.checkedAt ? window.setTimeout(check, 5000) : null;
    const interval = window.setInterval(check, 21600000);
    const focus = () => {
      if (Date.now() - updates.checkedAt >= 21600000) check();
    };
    window.addEventListener("online", focus);
    window.addEventListener("focus", focus);
    return () => {
      window.clearTimeout(timer);
      window.clearInterval(interval);
      window.removeEventListener("online", focus);
      window.removeEventListener("focus", focus);
    };
  }, [settings.checkUpdates, updates.checkedAt]);
  if (
    !updates.available ||
    updates.dismissed ||
    new URLSearchParams(location.search).has("play")
  )
    return null;
  return (
    <aside
      aria-label="App update available"
      className="fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] left-4 right-4 z-40 flex flex-wrap items-center gap-3 rounded-lg border border-white/20 bg-[#141b20] p-4 shadow-xl lg:bottom-6 lg:left-auto lg:max-w-md"
    >
      <p role="status" className="min-w-0 flex-1 text-sm">
        <strong className="block text-white">RainFlix update available</strong>
        <span className="text-slate-300">
          Version {updates.available.version}
        </span>
      </p>
      <a
        href={updates.available.url}
        className="inline-flex min-h-11 items-center rounded bg-sky-400 px-4 text-sm font-semibold text-black"
      >
        Download update
      </a>
      <button
        onClick={dismissAppUpdate}
        title="Remind me tomorrow"
        aria-label="Remind me tomorrow"
        className="grid h-11 w-11 place-items-center rounded hover:bg-white/10"
      >
        <X className="h-5 w-5" aria-hidden="true" />
      </button>
    </aside>
  );
}
