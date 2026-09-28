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
  const [items, setItems] = useState([]);
  const requiresInput = catalogExtras(catalog).some(
    (extra) => extra.isRequired && extra.name !== "skip",
  );
  useEffect(() => {
    if (requiresInput) return;
    const controller = new AbortController();
    setItems([]);
    getAddonCatalog(addon, catalog, { skip: 0 }, controller.signal)
      .then(({ items }) => {
        if (!controller.signal.aborted) setItems(items.slice(0, 12));
      })
      .catch(() => {
        if (!controller.signal.aborted) setItems([]);
      });
    return () => controller.abort();
  }, [addon, catalog, requiresInput]);
  if (requiresInput || !items.length) return null;
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
      <MediaGrid items={items} />
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
