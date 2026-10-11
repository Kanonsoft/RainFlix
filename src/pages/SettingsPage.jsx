import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { useAppSettings, saveAppSettings } from "../lib/app-settings.js";
import { clearArtworkCache } from "../lib/startup-artwork.js";
import { usePageMetadata } from "../lib/metadata.js";

const languages = [
  ["en", "English"],
  ["ja", "Japanese"],
  ["ko", "Korean"],
  ["zh", "Chinese"],
  ["es", "Spanish"],
  ["fr", "French"],
  ["de", "German"],
  ["pt", "Portuguese"],
  ["ar", "Arabic"],
  ["hi", "Hindi"],
  ["id", "Indonesian"],
  ["th", "Thai"],
  ["tl", "Filipino"],
];
export default function SettingsPage({ onReady }) {
  const settings = useAppSettings();
  const [cacheStatus, setCacheStatus] = useState("");
  usePageMetadata({ title: "Settings" });
  useEffect(() => {
    onReady?.();
  }, [onReady]);
  const toggle = (key, title) => (
    <label
      key={key}
      className="flex min-h-16 items-center justify-between gap-5 border-b border-white/10 py-4"
    >
      <span>{title}</span>
      <input
        type="checkbox"
        role="switch"
        checked={settings[key]}
        onChange={(event) => saveAppSettings({ [key]: event.target.checked })}
        className="h-5 w-9 shrink-0 accent-sky-400"
      />
    </label>
  );
  const language = (key, title, none) => (
    <label className="flex min-h-16 flex-wrap items-center justify-between gap-4 border-b border-white/10 py-4">
      <span>{title}</span>
      <select
        aria-label={title}
        value={settings[key]}
        onChange={(event) => saveAppSettings({ [key]: event.target.value })}
        className="min-h-11 max-w-full rounded border border-white/15 bg-slate-950 px-3 text-sm"
      >
        <option value="">{none}</option>
        {languages.map(([code, name]) => (
          <option key={code} value={code}>
            {name}
          </option>
        ))}
      </select>
    </label>
  );
  return (
    <section className="mx-auto w-full max-w-3xl px-5 py-8 md:px-10">
      <h1 className="text-3xl font-bold">Settings</h1>
      <h2 className="mt-9 text-lg font-semibold text-sky-200">Appearance</h2>
      {toggle("reduceAnimations", "Reduce animations")}
      <h2 className="mt-9 text-lg font-semibold text-sky-200">Playback</h2>
      {language("subtitleLanguage", "Preferred subtitles", "Off")}
      {language("audioLanguage", "Preferred audio", "Source default")}
      {toggle("autoNext", "Play next episode automatically")}
      {toggle("skipIntro", "Automatically skip intros")}
      {toggle("skipOutro", "Automatically skip endings")}
      {[
        ["introSeconds", "Intro fallback length"],
        ["outroSeconds", "Ending fallback length"],
      ].map(([key, title]) => (
        <label
          key={key}
          className="flex min-h-16 items-center justify-between gap-4 border-b border-white/10 py-4"
        >
          <span>{title}</span>
          <span className="flex items-center gap-2">
            <input
              aria-label={title}
              type="number"
              min="0"
              max="300"
              step="5"
              value={settings[key]}
              onChange={(event) =>
                saveAppSettings({
                  [key]: Math.max(0, Math.min(300, Number(event.target.value))),
                })
              }
              className="min-h-11 w-20 rounded border border-white/15 bg-slate-950 px-3"
            />
            <span className="text-sm text-slate-400">s</span>
          </span>
        </label>
      ))}
      <p className="mt-3 text-xs leading-5 text-slate-400">
        Fallback lengths apply when the stream has no intro or ending markers.
      </p>
      {toggle("preloadNext", "Prefetch next episode")}
      {toggle("nextPreview", "Show next episode preview")}
      <h2 className="mt-9 text-lg font-semibold text-sky-200">Storage</h2>
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 py-4">
        <span>Artwork and catalog cache</span>
        <button
          className="inline-flex min-h-11 items-center gap-2 rounded border border-white/15 px-4 hover:bg-white/10"
          disabled={cacheStatus === "Clearing..."}
          onClick={async () => {
            setCacheStatus("Clearing...");
            try {
              await clearArtworkCache();
              setCacheStatus("Cache cleared");
            } catch {
              setCacheStatus("Could not clear cache");
            }
          }}
        >
          <Trash2 className="h-4 w-4" />
          Clear cache
        </button>
      </div>
      <p role="status" className="mt-3 text-sm text-slate-400">
        {cacheStatus}
      </p>
    </section>
  );
}
