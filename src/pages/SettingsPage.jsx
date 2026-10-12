import { useEffect } from "react";
import { Link } from "react-router";
import { useAppSettings, saveAppSettings } from "../lib/app-settings.js";
import { usePageMetadata } from "../lib/metadata.js";
import { isDesktop } from "../platform/index.js";
import { setDesktopFullscreen } from "../platform/desktop.js";

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
        onChange={(event) => {
          const checked = event.target.checked;
          saveAppSettings({ [key]: checked });
          if (key === "fullscreenOnStart")
            void setDesktopFullscreen(checked).catch(console.warn);
        }}
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
      <h2 className="mt-9 text-lg font-semibold text-sky-200">Add-ons</h2>
      <Link
        to="/addons"
        className="flex min-h-16 items-center gap-4 border-b border-white/10 py-4 hover:text-sky-300 focus-visible:outline-sky-400"
      >
        <span className="flex-1">Manage add-ons</span>
      </Link>
      <h2 className="mt-9 text-lg font-semibold text-sky-200">Appearance</h2>
      {toggle("reduceAnimations", "Reduce animations")}
      {isDesktop && toggle("fullscreenOnStart", "Fullscreen on start")}
      <h2 className="mt-9 text-lg font-semibold text-sky-200">Playback</h2>
      {language("subtitleLanguage", "Preferred subtitles", "Off")}
      {language("audioLanguage", "Preferred audio", "Source default")}
      {toggle("autoNext", "Play next episode automatically")}
      {toggle("skipIntro", "Automatically skip intros")}
      {toggle("skipOutro", "Automatically skip endings")}
      {toggle("preloadNext", "Prefetch next episode")}
      {toggle("nextPreview", "Show next episode preview")}
      <h2 className="mt-9 text-lg font-semibold text-sky-200">
        Subtitle settings
      </h2>
      <Link
        to="/settings/subtitles"
        className="flex min-h-16 items-center gap-4 border-b border-white/10 py-4 hover:text-sky-300 focus-visible:outline-sky-400"
      >
        <span className="flex-1">Subtitle settings</span>
        <span className="text-sm text-slate-400">
          {Math.round(settings.subtitleScale * 100)}%
        </span>
      </Link>
    </section>
  );
}
