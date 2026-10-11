import { useEffect, useEffectEvent, useRef, useState } from "react";
import { Download, ExternalLink, Package, Trash2 } from "lucide-react";
import { httpUrl } from "../lib/addon-streams.js";
import {
  installAddon,
  removeAddon,
  toggleAddon,
  useAddons,
} from "../lib/addons.js";
import { takeAddonInstallLink } from "../lib/addon-install-links.js";
import AddonDirectory from "../components/AddonDirectory.jsx";
import AddonLogo from "../components/AddonLogo.jsx";

const inputClass =
  "min-h-11 min-w-0 rounded-lg border border-white/20 bg-black/50 px-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-sky-400";
const buttonClass =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-white/20 px-3 text-sm hover:border-sky-400 focus-visible:ring-2 focus-visible:ring-sky-400 disabled:opacity-40";

export default function AddonsPage({ onReady }) {
  const installed = useAddons();
  const [address, setAddress] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState("browse");
  const installController = useRef(null);
  const receiveLink = useEffectEvent(() => {
    const link = takeAddonInstallLink();
    if (link) {
      setAddress(link);
      install(link, true);
    }
  });
  useEffect(() => {
    onReady?.();
    const receive = () => {
      receiveLink();
    };
    receive();
    window.addEventListener("rainflix:addon-install", receive);
    return () => {
      installController.current?.abort();
      window.removeEventListener("rainflix:addon-install", receive);
    };
  }, [onReady]);

  async function install(url = address, fromLink = false) {
    if (busy && !fromLink) return;
    installController.current?.abort();
    setBusy(true);
    setMessage("");
    const requestedAddress = url;
    const controller = new AbortController();
    installController.current = controller;
    try {
      const addon = await installAddon(requestedAddress, controller.signal);
      if (!controller.signal.aborted) {
        setMessage(`${addon.manifest.name} installed.`);
        setAddress((current) => (current === requestedAddress ? "" : current));
      }
    } catch (error) {
      if (!controller.signal.aborted) setMessage(error.message);
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-[1200px] space-y-6 px-4 py-8 sm:px-6 md:px-10 lg:px-12">
      <h1 className="text-3xl font-bold">Add-ons</h1>
      <form
        className="flex flex-wrap items-center gap-3 border-y border-white/10 py-5"
        onSubmit={(event) => {
          event.preventDefault();
          install();
        }}
      >
        <input
          className={`${inputClass} w-full flex-1 basis-64`}
          aria-label="Manifest URL"
          placeholder="Install from manifest URL"
          value={address}
          onChange={(event) => setAddress(event.target.value)}
          required
        />
        <button className={buttonClass} disabled={busy} type="submit">
          <Download size={16} />
          {busy ? "Installing..." : "Install"}
        </button>
      </form>
      {message && (
        <p role="status" className="text-sm text-sky-200">
          {message}
        </p>
      )}
      <div
        role="tablist"
        aria-label="Add-ons"
        className="flex gap-6 border-b border-white/15"
      >
        {["browse", "installed"].map((value) => (
          <button
            key={value}
            id={`addons-tab-${value}`}
            role="tab"
            type="button"
            aria-selected={tab === value}
            aria-controls={`addons-panel-${value}`}
            tabIndex={tab === value ? 0 : -1}
            className={`min-h-12 border-b-2 px-1 text-base font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 ${tab === value ? "border-sky-400 text-white" : "border-transparent text-slate-400 hover:text-white"}`}
            onClick={() => setTab(value)}
            onKeyDown={(event) => {
              if (
                !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)
              )
                return;
              event.preventDefault();
              const next =
                event.key === "Home"
                  ? "browse"
                  : event.key === "End"
                    ? "installed"
                    : value === "browse"
                      ? "installed"
                      : "browse";
              setTab(next);
              document.getElementById(`addons-tab-${next}`)?.focus();
            }}
          >
            {value === "browse" ? "Browse" : `Installed (${installed.length})`}
          </button>
        ))}
      </div>
      <div
        id="addons-panel-installed"
        role="tabpanel"
        aria-labelledby="addons-tab-installed"
        hidden={tab !== "installed"}
      >
        {!installed.length && (
          <p className="text-slate-400">No add-ons installed.</p>
        )}
        <div className="grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {installed.map((entry) => {
            const manifest = entry.manifest;
            const configureUrl =
              httpUrl(entry.configureUrl) ||
              (manifest.behaviorHints?.configurable &&
                httpUrl(entry.manifestUrl)?.replace(
                  /manifest\.json(?:\?.*)?$/,
                  "configure",
                ));
            return (
              <article
                className="flex min-w-0 flex-col gap-5 rounded-lg border border-white/10 bg-white/[0.035] p-5 transition-colors hover:border-white/25"
                key={entry.id}
              >
                <div className="flex min-w-0 items-center gap-3">
                  {httpUrl(manifest.logo) ? (
                    <AddonLogo
                      url={httpUrl(manifest.logo)}
                      className="h-12 w-12 shrink-0 rounded-lg object-contain"
                    />
                  ) : (
                    <Package className="h-12 w-12 shrink-0 text-sky-300" />
                  )}
                  <h3 className="min-w-0 break-words text-lg font-bold">
                    {manifest.name}
                  </h3>
                </div>
                {manifest.description && (
                  <p className="line-clamp-3 break-words text-sm leading-6 text-slate-400">
                    {manifest.description}
                  </p>
                )}
                <div className="mt-auto flex flex-wrap items-center gap-3 border-t border-white/10 pt-4">
                  <label className="mr-auto flex min-h-11 items-center gap-2 text-sm text-slate-300">
                    <input
                      type="checkbox"
                      role="switch"
                      className="h-5 w-9 accent-sky-400"
                      checked={entry.enabled}
                      onChange={() => toggleAddon(entry.id)}
                    />
                    Enabled
                  </label>
                  <button
                    className={buttonClass}
                    type="button"
                    aria-label={`Remove ${manifest.name}`}
                    title="Remove add-on"
                    onClick={() => removeAddon(entry.id)}
                  >
                    <Trash2 size={16} />
                  </button>
                  {configureUrl && (
                    <a
                      className={buttonClass}
                      href={configureUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Configure <ExternalLink size={14} />
                    </a>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </div>
      <div
        id="addons-panel-browse"
        role="tabpanel"
        aria-labelledby="addons-tab-browse"
        hidden={tab !== "browse"}
      >
        <AddonDirectory installed={installed} onInstall={install} busy={busy} />
      </div>
    </div>
  );
}
