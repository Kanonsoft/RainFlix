import { useEffect, useState } from "react";
import { Link } from "react-router";
import { useAddons } from "../lib/addons.js";
import {
  addonCatalogLabel,
  addonCatalogs,
  addonCatalogPath,
  catalogExtras,
  getAddonCatalog,
} from "../lib/addon-catalogs.js";
import { MediaGrid } from "./MediaCard.jsx";

function CatalogRow({ addon, catalog }) {
  const [feed, setFeed] = useState({ items: [], loading: true });
  const [revision, setRevision] = useState(0);
  const requiresInput = catalogExtras(catalog).some(
    (extra) => extra.isRequired && extra.name !== "skip",
  );
  useEffect(() => {
    if (requiresInput) return;
    const controller = new AbortController();
    setFeed({ items: [], loading: true });
    getAddonCatalog(addon, catalog, { skip: 0 }, controller.signal)
      .then(({ items }) => {
        if (!controller.signal.aborted)
          setFeed({ items: items.slice(0, 12), loading: false });
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setFeed({ items: [], loading: false, error: error.message });
      });
    return () => controller.abort();
  }, [addon, catalog, requiresInput, revision]);
  return (
    <section
      className="mt-12"
      aria-label={`${addon.manifest.name}: ${addonCatalogLabel(catalog)}`}
    >
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-sky-300">{addon.manifest.name}</p>
          <h2 className="break-words text-2xl font-bold">
            {addonCatalogLabel(catalog)}
          </h2>
        </div>
        <Link
          className="py-2 text-sm font-bold text-sky-300 hover:underline"
          to={addonCatalogPath(addon, catalog)}
        >
          Browse catalog
        </Link>
      </div>
      {requiresInput ? (
        <p className="text-sm text-slate-400">
          Choose filters in this catalog to see titles.
        </p>
      ) : feed.error ? (
        <div role="status" className="text-sm text-slate-400">
          <p>{feed.error}</p>
          <button
            type="button"
            onClick={() => setRevision((value) => value + 1)}
            className="mt-2 min-h-11 text-sky-300 underline"
          >
            Retry catalog
          </button>
        </div>
      ) : (
        <MediaGrid items={feed.items} loading={feed.loading} />
      )}
    </section>
  );
}
export default function AddonCatalogRows() {
  const installed = useAddons();
  return installed.flatMap((addon) =>
    addonCatalogs(addon).map((catalog) => (
      <CatalogRow
        key={`${addon.id}:${catalog.type}:${catalog.id}`}
        addon={addon}
        catalog={catalog}
      />
    )),
  );
}
