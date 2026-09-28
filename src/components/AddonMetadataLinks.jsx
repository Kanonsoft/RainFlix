import { Link } from "react-router";
import { supports, useAddons } from "../lib/addons.js";
import { addonTitlePath } from "../lib/addon-catalogs.js";

export default function AddonMetadataLinks({ details }) {
  const installed = useAddons();
  const type = details.mediaType === "tv" ? "series" : "movie";
  const id = details.imdbId;
  const providers = id
    ? installed.filter((addon) => supports(addon, "meta", type, id))
    : [];
  if (!providers.length) return null;
  return (
    <div className="mt-5 border-t border-white/10 pt-4">
      <p className="text-xs font-bold text-slate-300">Add-on details</p>
      <div className="mt-2 flex flex-wrap gap-3">
        {providers.map((addon) => (
          <Link
            key={addon.id}
            className="min-h-11 py-3 text-sm text-sky-300 underline"
            to={addonTitlePath(addon, type, id)}
          >
            {addon.manifest.name}
          </Link>
        ))}
      </div>
    </div>
  );
}
