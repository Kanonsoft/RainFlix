import { useEffect, useState } from "react";
import { Download, ExternalLink, Package, Search } from "lucide-react";
import { addonFetch, httpUrl } from "../lib/addon-streams.js";

const directory = "https://stremio-addons.net/api/v0";
const inputClass =
  "min-h-11 min-w-0 rounded-lg border border-white/20 bg-black/50 px-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-sky-400";
const buttonClass =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-white/20 px-3 text-sm hover:border-sky-400 focus-visible:ring-2 focus-visible:ring-sky-400 disabled:opacity-40";

export default function AddonDirectory({ installed, onInstall, busy }) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [categories, setCategories] = useState([]);
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [feed, setFeed] = useState({ addons: [], loading: true });
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
            setFeed({ addons: [], loading: false, error: error.message });
        });
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [search, category, page, revision]);

  return (
    <section aria-labelledby="addonDirectoryHeading" className="space-y-4">
      <h2
        id="addonDirectoryHeading"
        className="border-b border-white/15 pb-3 text-lg font-semibold"
      >
        Browse add-ons
      </h2>
      <div className="flex flex-wrap gap-3">
        <label
          className={`${inputClass} flex flex-1 basis-64 items-center gap-2`}
        >
          <Search size={18} aria-hidden="true" />
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
      {feed.loading ? (
        <p role="status">Loading add-ons...</p>
      ) : feed.error ? (
        <div role="alert">
          <p>{feed.error}</p>
          <button
            type="button"
            className={`${buttonClass} mt-3`}
            onClick={() => setRevision((value) => value + 1)}
          >
            Retry directory
          </button>
        </div>
      ) : !feed.addons.length ? (
        <p className="text-slate-400">No matching add-ons.</p>
      ) : (
        <div className="grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {feed.addons.map((entry) => {
            const manifest = entry.manifest || {};
            const address = httpUrl(entry.manifestUrl);
            const active = installed.some(
              (item) => item.manifestUrl === address,
            );
            const configureUrl =
              httpUrl(entry.configureUrl) ||
              (manifest.behaviorHints?.configurable &&
                address?.replace(/manifest\.json(?:\?.*)?$/, "configure"));
            return (
              <article
                key={entry.uuid || entry.id || address}
                className="flex min-w-0 flex-col gap-4 rounded-lg border border-white/15 bg-black/35 p-4"
              >
                <div className="flex min-w-0 items-center gap-3">
                  {httpUrl(manifest.logo) ? (
                    <img
                      src={httpUrl(manifest.logo)}
                      alt=""
                      loading="lazy"
                      draggable={false}
                      referrerPolicy="no-referrer"
                      className="h-12 w-12 shrink-0 rounded-lg object-contain"
                    />
                  ) : (
                    <Package className="h-12 w-12 shrink-0 text-sky-300" />
                  )}
                  <h3 className="min-w-0 break-words text-base font-bold">
                    {manifest.name || entry.slug}
                  </h3>
                </div>
                <p className="line-clamp-3 break-words text-sm text-slate-300">
                  {String(manifest.description || "")}
                </p>
                <div className="mt-auto flex flex-wrap items-center gap-2">
                  {active ? (
                    <span className="text-sm text-sky-300">Installed</span>
                  ) : (
                    <button
                      type="button"
                      className={buttonClass}
                      disabled={
                        busy ||
                        !address ||
                        Boolean(manifest.behaviorHints?.configurationRequired)
                      }
                      onClick={() => onInstall(address)}
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
                </div>
                {manifest.behaviorHints?.configurationRequired && !active && (
                  <p className="text-xs text-slate-400">
                    Configuration required
                  </p>
                )}
              </article>
            );
          })}
        </div>
      )}
      {!feed.loading && !feed.error && (
        <div className="flex flex-wrap items-center justify-center gap-4">
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
      <p className="text-xs text-slate-500">Directory by Stremio Addons</p>
    </section>
  );
}
