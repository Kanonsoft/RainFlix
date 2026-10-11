import { useEffect } from "react";
import { useAppSettings, saveAppSettings } from "../lib/app-settings.js";
import { usePageMetadata } from "../lib/metadata.js";
import { isDesktop } from "../platform/index.js";
import { setDesktopFullscreen } from "../platform/desktop.js";
import subtitlePreview from "../../assets/startup/poster-02.jpg";

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
  const subtitleControl = (key, title, min, max, step, format) => (
    <label className="grid min-w-0 gap-3 border-b border-white/10 py-4">
      <span className="flex items-center justify-between gap-4">
        <span>{title}</span>
        <span className="text-sm tabular-nums text-sky-200">
          {format(settings[key])}
        </span>
      </span>
      <input
        aria-label={title}
        type="range"
        min={min}
        max={max}
        step={step}
        value={settings[key]}
        onChange={(event) =>
          saveAppSettings({ [key]: Number(event.target.value) })
        }
        className="m-0 h-8 w-full min-w-0 max-w-full accent-sky-400"
      />
    </label>
  );
  return (
    <section className="mx-auto w-full max-w-3xl px-5 py-8 md:px-10">
      <h1 className="text-3xl font-bold">Settings</h1>
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
      <figure
        aria-label="Subtitle preview"
        className="relative mt-5 aspect-video w-full min-w-0 overflow-hidden rounded-md bg-black"
      >
        <img
          src={subtitlePreview}
          alt=""
          draggable="false"
          className="h-full w-full object-cover brightness-75"
        />
        <figcaption
          className="absolute inset-x-3 text-center font-medium leading-snug text-white"
          style={{
            bottom: `${100 - settings.subtitlePosition}%`,
            fontSize: `${14 * settings.subtitleScale}px`,
            textShadow:
              "-1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000",
          }}
        >
          A new story begins.
        </figcaption>
      </figure>
      {subtitleControl(
        "subtitleScale",
        "Subtitle size",
        0.5,
        2.5,
        0.1,
        (value) => `${Math.round(value * 100)}%`,
      )}
      {subtitleControl(
        "subtitlePosition",
        "Subtitle vertical position",
        50,
        100,
        2,
        (value) => `${100 - value}% from bottom`,
      )}
      {subtitleControl(
        "subtitleDelay",
        "Subtitle delay",
        -10,
        10,
        0.1,
        (value) => `${value >= 0 ? "+" : ""}${value.toFixed(1)} s`,
      )}
    </section>
  );
}
