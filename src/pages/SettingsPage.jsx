import { useEffect } from "react";
import { Link } from "react-router";
import { useAppSettings, saveAppSettings } from "../lib/app-settings.js";
import { usePageMetadata } from "../lib/metadata.js";
import { isDesktop } from "../platform/index.js";
import { setDesktopFullscreen } from "../platform/desktop.js";
import UpdateSettings from "../components/UpdateSettings.jsx";
import { useAccount } from "../lib/account-sync.js";

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
export default function SettingsPage({ onReady, section }) {
  const settings = useAppSettings();
  const account = useAccount();
  const title =
    { appearance: "Appearance", playback: "Playback", updates: "App updates" }[
      section
    ] || "Settings";
  usePageMetadata({ title });
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
      <h1 className="text-3xl font-bold">{title}</h1>
      {!section && (
        <nav aria-label="Settings sections" className="mt-6">
          <Link
            to="/settings/account"
            className="flex min-h-16 flex-wrap items-center justify-between gap-x-5 gap-y-2 border-b border-white/10 py-4 hover:text-sky-300"
          >
            <span>Account &amp; sync</span>
            {account.user?.email && (
              <span className="min-w-0 break-all text-sm text-slate-300">
                {account.user.email}
              </span>
            )}
          </Link>
          {[
            ["/addons", "Manage add-ons"],
            ["/settings/appearance", "Appearance"],
            ["/settings/playback", "Playback"],
            ["/settings/subtitles", "Subtitle settings"],
            ["/settings/updates", "App updates"],
          ].map(([to, label]) => (
            <Link
              key={to}
              to={to}
              className="flex min-h-16 items-center border-b border-white/10 py-4 hover:text-sky-300"
            >
              {label}
            </Link>
          ))}
        </nav>
      )}
      {section === "appearance" && (
        <div className="mt-6">
          {toggle("reduceAnimations", "Reduce animations")}
          {isDesktop && toggle("fullscreenOnStart", "Fullscreen on start")}
        </div>
      )}
      {section === "playback" && (
        <div className="mt-6">
          {language("subtitleLanguage", "Preferred subtitles", "Off")}
          {language("audioLanguage", "Preferred audio", "Source default")}
          {toggle("autoNext", "Play next episode automatically")}
          {toggle("skipIntro", "Automatically skip intros")}
          {toggle("skipOutro", "Automatically skip endings")}
          {toggle("preloadNext", "Prefetch next episode")}
          {toggle("nextPreview", "Show next episode preview")}
        </div>
      )}
      {section === "updates" && <UpdateSettings />}
    </section>
  );
}
