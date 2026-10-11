import { useEffect, useRef, useState } from "react";
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

const inputClass =
  "min-h-11 min-w-0 rounded-lg border border-white/20 bg-black/50 px-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-sky-400";
const buttonClass =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-white/20 px-3 text-sm hover:border-sky-400 focus-visible:ring-2 focus-visible:ring-sky-400 disabled:opacity-40";

export default function AddonsPage({ onReady }) {
  const installed = useAddons();
  const [address, setAddress] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const installController = useRef(null);
  useEffect(() => {
    onReady?.();
    const receive = () => {
      const link = takeAddonInstallLink();
      if (link) setAddress(link);
    };
    receive();
    window.addEventListener("rainflix:addon-install", receive);
    return () => {
      installController.current?.abort();
      window.removeEventListener("rainflix:addon-install", receive);
    };
  }, [onReady]);

  async function install(url = address) {
    if (busy) return;
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
    <div className="mx-auto w-full max-w-[1440px] space-y-6 px-6 py-8 md:px-10 lg:px-12">
      <h1 className="text-2xl font-bold">Add-ons</h1>
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          install();
        }}
      >
        <input
          className={`${inputClass} w-full flex-1 basis-64`}
          aria-label="Manifest URL"
          placeholder="https://example.com/manifest.json"
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
      <h2 className="border-b border-white/15 pb-3 text-lg font-semibold">
        Installed ({installed.length})
      </h2>
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
              className="flex min-w-0 flex-col gap-4 rounded-lg border border-white/15 bg-black/35 p-4"
              key={entry.id}
            >
              <div className="flex min-w-0 items-center gap-3">
                {httpUrl(manifest.logo) ? (
                  <img
                    src={httpUrl(manifest.logo)}
                    alt=""
                    referrerPolicy="no-referrer"
                    loading="lazy"
                    draggable={false}
                    className="h-12 w-12 shrink-0 rounded-lg object-contain"
                  />
                ) : (
                  <Package className="h-12 w-12 shrink-0 text-sky-300" />
                )}
                <h3 className="min-w-0 break-words text-base font-bold">
                  {manifest.name}
                </h3>
              </div>
              <div className="mt-auto flex flex-wrap items-center gap-2">
                <label className="flex min-h-11 items-center gap-2 text-sm">
                  <input
                    type="checkbox"
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
      <AddonDirectory installed={installed} onInstall={install} busy={busy} />
    </div>
  );
}
