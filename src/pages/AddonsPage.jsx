import { useEffect, useRef, useState } from "react";
import { Download, ExternalLink, Package, Search, Trash2 } from "lucide-react";
import { addonFetch, httpUrl } from "../lib/addon-streams.js";
import {
  installAddon,
  removeAddon,
  toggleAddon,
  useAddons,
} from "../lib/addons.js";

const inputClass =
  "min-h-11 min-w-0 rounded-lg border border-white/20 bg-black/50 px-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-sky-400";
const buttonClass =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-white/20 px-3 text-sm hover:border-sky-400 focus-visible:ring-2 focus-visible:ring-sky-400 disabled:opacity-40";
const directory = "https://stremio-addons.net/api/v0";

export default function AddonsPage({ onReady }) {
  const installed = useAddons();
  const [tab, setTab] = useState("browse");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [categories, setCategories] = useState([]);
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [feed, setFeed] = useState({ addons: [], loading: true });
  const [address, setAddress] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const installController = useRef(null);
  useEffect(() => {
    onReady?.();
    return () => installController.current?.abort();
  }, [onReady]);
  useEffect(() => {
    const controller = new AbortController();
    addonFetch(`${directory}/categories`, controller.signal, {
      label: "Add-on directory",
    })
      .then((data) => {
        if (!controller.signal.aborted)
          setCategories(Array.isArray(data.categories) ? data.categories : []);
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);
  useEffect(() => {
    if (tab !== "browse") return;
    const controller = new AbortController();
    setFeed({ addons: [], loading: true });
    const timer = setTimeout(() => {
      const query = new URLSearchParams({
        page: String(page),
        limit: "24",
        search,
        nsfw: "exclude",
        sort_by: "stars",
        order: "desc",
      });
      if (category) query.set("category", category);
      addonFetch(`${directory}/addons?${query}`, controller.signal, {
        label: "Add-on directory",
      })
        .then((data) => {
          if (!Array.isArray(data.addons))
            throw new Error("The directory returned an invalid list.");
          if (!controller.signal.aborted) setFeed({ ...data, loading: false });
        })
        .catch((error) => {
          if (!controller.signal.aborted)
            setFeed({ addons: [], error: error.message, loading: false });
        });
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [tab, search, category, page, revision]);
  async function install(url) {
    if (busy) return;
    setBusy(true);
    setMessage("");
    const controller = new AbortController();
    installController.current = controller;
    try {
      const addon = await installAddon(url, controller.signal);
      if (!controller.signal.aborted) {
        setMessage(`${addon.manifest.name} installed.`);
        setAddress("");
      }
    } catch (error) {
      if (!controller.signal.aborted) setMessage(error.message);
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  const entries = tab === "installed" ? installed : feed.addons;
  return (
    <div className="mx-auto w-full max-w-[1440px] space-y-6 px-6 py-8 md:px-10 lg:px-12">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Add-ons</h1>
        <a
          href="https://stremio-addons.net"
          target="_blank"
          rel="noreferrer"
          className="text-sm text-sky-300 underline"
        >
          Directory by Stremio Addons{" "}
          <ExternalLink className="inline h-3 w-3" />
        </a>
      </div>
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          install(address);
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
      <p className="text-sm text-slate-400">
        Installed add-ons are kept for this tab session. Configured links may
        contain account keys.
      </p>
      {message && (
        <p role="status" className="text-sm text-sky-200">
          {message}
        </p>
      )}
      <div
        className="flex gap-6 border-b border-white/15"
        role="tablist"
        aria-label="Add-ons"
      >
        {[
          ["browse", "Browse"],
          ["installed", `Installed (${installed.length})`],
        ].map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            className={`min-h-11 border-b-2 ${tab === id ? "border-sky-400 text-sky-300" : "border-transparent"}`}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "browse" && (
        <div className="flex flex-wrap gap-3">
          <label
            className={`${inputClass} flex flex-1 basis-64 items-center gap-2`}
          >
            <Search size={18} />
            <input
              className="min-w-0 flex-1 bg-transparent py-3 outline-none"
              aria-label="Search add-ons"
              placeholder="Search add-ons"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
            />
          </label>
          <select
            className={`${inputClass} max-w-full`}
            aria-label="Add-on category"
            value={category}
            onChange={(event) => {
              setCategory(event.target.value);
              setPage(1);
            }}
          >
            <option value="">All categories</option>
            {categories.map((item) => (
              <option key={item.slug} value={item.slug}>
                {item.name}
              </option>
            ))}
          </select>
        </div>
      )}
      {tab === "browse" && feed.loading && (
        <p role="status">Loading add-ons...</p>
      )}
      {tab === "browse" && feed.error && (
        <div role="alert">
          <p>{feed.error}</p>
          <button
            type="button"
            className={`${buttonClass} mt-3`}
            onClick={() => setRevision((value) => value + 1)}
          >
            Retry
          </button>
        </div>
      )}
      {!(tab === "browse" && (feed.loading || feed.error)) &&
        !entries.length && (
          <p className="text-slate-400">
            {tab === "installed"
              ? "No add-ons installed."
              : "No matching add-ons."}
          </p>
        )}
      <div className="grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {entries.map((entry) => {
          const manifest = entry.manifest || {};
          const active = installed.find(
            (item) => item.manifestUrl === entry.manifestUrl,
          );
          const resources = (
            Array.isArray(manifest.resources) ? manifest.resources : []
          )
            .map((item) => (typeof item === "string" ? item : item?.name))
            .filter(Boolean);
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
              key={entry.uuid || entry.id}
            >
              <div className="flex min-w-0 items-center gap-3">
                {httpUrl(manifest.logo) ? (
                  <img
                    src={httpUrl(manifest.logo)}
                    alt=""
                    referrerPolicy="no-referrer"
                    loading="lazy"
                    className="h-12 w-12 shrink-0 rounded-lg object-contain"
                    onError={(event) => {
                      event.currentTarget.style.visibility = "hidden";
                    }}
                  />
                ) : (
                  <Package className="h-12 w-12 shrink-0 text-sky-300" />
                )}
                <h2 className="min-w-0 break-words text-base font-bold">
                  {manifest.name || entry.slug}
                </h2>
              </div>
              <p className="line-clamp-3 break-words text-sm text-slate-300">
                {String(manifest.description || "")}
              </p>
              <p className="text-xs text-slate-400">
                {resources
                  .map(
                    (name) =>
                      ({
                        stream: "Streams",
                        catalog: "Catalogs",
                        meta: "Title details",
                        subtitles: "Subtitles with streams",
                      })[name] || `${name} (not supported)`,
                  )
                  .join(" · ") || "No declared capabilities"}
              </p>
              <div className="mt-auto flex flex-wrap items-center gap-2">
                {active ? (
                  <>
                    <label className="flex min-h-11 items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={active.enabled}
                        onChange={() => toggleAddon(active.id)}
                      />
                      Enabled
                    </label>
                    <button
                      className={buttonClass}
                      type="button"
                      aria-label={`Remove ${manifest.name}`}
                      title="Remove add-on"
                      onClick={() => removeAddon(active.id)}
                    >
                      <Trash2 size={16} />
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className={buttonClass}
                    disabled={
                      busy ||
                      Boolean(manifest.behaviorHints?.configurationRequired)
                    }
                    onClick={() => install(entry.manifestUrl)}
                  >
                    <Download size={16} />
                    Install
                  </button>
                )}
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
                {httpUrl(entry.url) && (
                  <a
                    className="text-sm text-sky-300 underline"
                    href={httpUrl(entry.url)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Details
                  </a>
                )}
              </div>
              {manifest.behaviorHints?.configurationRequired && !active && (
                <p className="text-xs text-amber-200">Configuration required</p>
              )}
            </article>
          );
        })}
      </div>
      {tab === "browse" && !feed.loading && !feed.error && (
        <div className="flex items-center justify-center gap-4">
          <button
            type="button"
            className={buttonClass}
            disabled={page === 1}
            onClick={() => setPage((value) => value - 1)}
          >
            Previous
          </button>
          <span className="text-sm">Page {page}</span>
          <button
            type="button"
            className={buttonClass}
            disabled={!feed.pagination?.hasNextPage}
            onClick={() => setPage((value) => value + 1)}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
