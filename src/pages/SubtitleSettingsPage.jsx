import { useEffect } from "react";
import { RotateCcw } from "lucide-react";
import { saveAppSettings, useAppSettings } from "../lib/app-settings.js";
import { usePageMetadata } from "../lib/metadata.js";
import subtitlePreview from "../../assets/startup/poster-02.jpg";

function Adjustment({ name, title, value, min, max, step, format }) {
  return (
    <label className="grid min-w-0 gap-4 border-b border-white/10 py-6">
      <span className="flex items-center justify-between gap-4">
        <span className="font-semibold">{title}</span>
        <span className="text-sm tabular-nums text-sky-200">
          {format(value)}
        </span>
      </span>
      <input
        type="range"
        aria-label={title}
        aria-valuetext={format(value)}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) =>
          saveAppSettings({ [name]: Number(event.target.value) })
        }
        className="h-8 w-full min-w-0 cursor-pointer accent-sky-400"
      />
    </label>
  );
}

export default function SubtitleSettingsPage({ onReady }) {
  const settings = useAppSettings();
  usePageMetadata({ title: "Subtitle settings" });
  useEffect(() => {
    onReady?.();
  }, [onReady]);
  return (
    <section className="mx-auto w-full max-w-6xl px-5 pb-16 pt-8 md:px-10">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold md:text-3xl">Subtitle settings</h1>
        <button
          type="button"
          aria-label="Reset subtitle settings"
          title="Reset subtitle settings"
          onClick={() =>
            saveAppSettings({
              subtitleScale: 1,
              subtitlePosition: 92,
              subtitleDelay: 0,
            })
          }
          className="inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-md border border-white/20 px-3 text-sm font-semibold text-slate-200 transition hover:border-sky-400 hover:text-sky-300 focus-visible:outline-sky-400 sm:px-4"
        >
          <RotateCcw size={16} aria-hidden="true" />
          <span className="hidden sm:inline">Reset</span>
        </button>
      </div>
      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] lg:gap-12">
        <div className="min-w-0 lg:sticky lg:top-24">
          <h2 className="mb-4 text-sm font-semibold text-slate-300">Preview</h2>
          <figure
            aria-label="Subtitle preview"
            className="relative aspect-video w-full overflow-hidden rounded-md bg-black"
          >
            <img
              src={subtitlePreview}
              alt=""
              draggable="false"
              className="h-full w-full object-cover brightness-75"
            />
            <figcaption
              className="absolute inset-x-3 break-words text-center font-medium leading-snug text-white"
              style={{
                bottom: `max(4px, ${100 - settings.subtitlePosition}%)`,
                fontSize: `${18 * settings.subtitleScale}px`,
                textShadow:
                  "-1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000",
              }}
            >
              A new story.
            </figcaption>
          </figure>
        </div>
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-sky-200">Appearance</h2>
          <Adjustment
            name="subtitleScale"
            title="Subtitle size"
            value={settings.subtitleScale}
            min={0.5}
            max={2.5}
            step={0.1}
            format={(value) => `${Math.round(value * 100)}%`}
          />
          <Adjustment
            name="subtitlePosition"
            title="Subtitle vertical position"
            value={settings.subtitlePosition}
            min={50}
            max={100}
            step={2}
            format={(value) => `${100 - value}% from bottom`}
          />
          <h2 className="mt-8 text-lg font-semibold text-sky-200">Timing</h2>
          <Adjustment
            name="subtitleDelay"
            title="Subtitle delay"
            value={settings.subtitleDelay}
            min={-10}
            max={10}
            step={0.1}
            format={(value) => `${value >= 0 ? "+" : ""}${value.toFixed(1)} s`}
          />
        </div>
      </div>
    </section>
  );
}
