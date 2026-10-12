import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import { useAddons } from "../lib/addons.js";
import {
  addonCatalogLabel,
  addonCatalogs,
  catalogExtras,
  getAddonCatalog,
} from "../lib/addon-catalogs.js";
import { MediaGrid } from "../components/MediaCard.jsx";

const controlClass =
  "min-h-11 min-w-0 max-w-full rounded-lg border border-white/20 bg-slate-950 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400";

function Catalog({ addon, catalog }) {
  const [params, setParams] = useSearchParams();
  const query = params.toString();
  const extras = catalogExtras(catalog);
  const missing = extras.filter(
    (extra) =>
      extra.isRequired && extra.name !== "skip" && !params.get(extra.name),
  );
  const [feed, setFeed] = useState({ items: [], loading: false });
  const [revision, setRevision] = useState(0);
  const offset = Math.max(0, Number.parseInt(params.get("skip"), 10) || 0);
  const [pageSize, setPageSize] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const sentinel = useRef(null);
  const request = useRef(null);
  const busy = useRef(false);
  useEffect(() => {
    const controller = new AbortController();
    request.current = controller;
    busy.current = false;
    setHasMore(false);
    const values = Object.fromEntries(new URLSearchParams(query));
    const definitions = catalogExtras(catalog);
    if (
      definitions.some(
        (extra) =>
          extra.isRequired && extra.name !== "skip" && !values[extra.name],
      )
    ) {
      setFeed({ items: [], loading: false });
      return;
    }
    setFeed({ items: [], loading: true });
    getAddonCatalog(
      addon,
      catalog,
      { ...values, skip: offset },
      controller.signal,
    )
      .then((result) => {
        if (controller.signal.aborted) return;
        setFeed({ items: result.items, loading: false });
        setPageSize(offset + result.count);
        setHasMore(
          result.items.length > 0 &&
            definitions.some((extra) => extra.name === "skip"),
        );
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setFeed({ items: [], error: error.message, loading: false });
      });
    return () => controller.abort();
  }, [addon, catalog, query, offset, revision]);
  const loadMore = useCallback(async () => {
    if (
      busy.current ||
      feed.loading ||
      !hasMore ||
      request.current?.signal.aborted
    )
      return;
    busy.current = true;
    const signal = request.current.signal;
    setFeed((current) => ({ ...current, loadingMore: true, moreError: false }));
    try {
      const result = await getAddonCatalog(
        addon,
        catalog,
        { ...Object.fromEntries(new URLSearchParams(query)), skip: pageSize },
        signal,
      );
      if (signal.aborted) return;
      const known = new Set(
        feed.items.map((item) => `${item.mediaType}:${item.id}`),
      );
      const added = result.items.filter(
        (item) => !known.has(`${item.mediaType}:${item.id}`),
      );
      setFeed((current) => ({
        ...current,
        items: [...current.items, ...added],
        loadingMore: false,
      }));
      setPageSize((current) => current + result.count);
      setHasMore(added.length > 0 && result.count > 0);
    } catch {
      if (!signal.aborted)
        setFeed((current) => ({
          ...current,
          loadingMore: false,
          moreError: true,
        }));
    } finally {
      if (!signal.aborted) busy.current = false;
    }
  }, [addon, catalog, query, pageSize, hasMore, feed.loading, feed.items]);
  useEffect(() => {
    if (
      !sentinel.current ||
      !hasMore ||
      feed.loading ||
      feed.loadingMore ||
      feed.moreError
    )
      return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) void loadMore();
      },
      { rootMargin: "300px" },
    );
    observer.observe(sentinel.current);
    return () => observer.disconnect();
  }, [hasMore, feed.loading, feed.loadingMore, feed.moreError, loadMore]);
  return (
    <>
      <h1 className="mt-4 break-words text-2xl font-bold">
        {addonCatalogLabel(catalog)}
      </h1>
      <p className="mt-1 text-sm text-sky-300">{addon.manifest.name}</p>
      {extras.some((extra) => extra.name !== "skip") && (
        <form
          key={query}
          className="my-6 flex flex-wrap items-end gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            const next = new URLSearchParams();
            for (const [name, value] of new FormData(event.currentTarget))
              if (String(value).trim()) next.set(name, String(value).trim());
            setParams(next, { replace: true });
          }}
        >
          {extras
            .filter((extra) => extra.name !== "skip")
            .map((extra) => (
              <label
                key={extra.name}
                className="grid min-w-0 flex-1 basis-48 gap-2 text-sm capitalize"
              >
                {extra.name}
                {extra.isRequired ? " *" : ""}
                {Array.isArray(extra.options) && extra.options.length ? (
                  <select
                    className={controlClass}
                    name={extra.name}
                    defaultValue={params.get(extra.name) || ""}
                    required={Boolean(extra.isRequired)}
                  >
                    <option value="">
                      {extra.isRequired ? "Select" : "All"}
                    </option>
                    {extra.options
                      .filter((value) => typeof value === "string")
                      .map((value) => (
                        <option key={value} value={value}>
                          {value}
                        </option>
                      ))}
                  </select>
                ) : (
                  <input
                    className={controlClass}
                    name={extra.name}
                    defaultValue={params.get(extra.name) || ""}
                    required={Boolean(extra.isRequired)}
                  />
                )}
              </label>
            ))}
          <button type="submit" className={`${controlClass} text-sky-300`}>
            Apply filters
          </button>
        </form>
      )}
      <div className="mt-6">
        {missing.length ? (
          <p className="text-slate-400">
            Choose {missing.map((extra) => extra.name).join(", ")} to browse
            this catalog.
          </p>
        ) : feed.error ? (
          <div role="alert">
            <p>{feed.error}</p>
            <button
              className={`${controlClass} mt-3`}
              onClick={() => setRevision((value) => value + 1)}
            >
              Retry catalog
            </button>
          </div>
        ) : (
          <MediaGrid
            browse
            items={feed.items}
            loading={feed.loading}
            ghostCount={feed.loadingMore ? 12 : 0}
          />
        )}
      </div>
      {!missing.length && hasMore && !feed.error && (
        <div ref={sentinel} className="mt-6 min-h-1">
          {feed.moreError && (
            <button className={controlClass} onClick={loadMore}>
              Retry catalog
            </button>
          )}
        </div>
      )}
    </>
  );
}
export default function AddonCatalogPage({ onReady }) {
  const { addonId, type, catalogId } = useParams();
  const installed = useAddons();
  const addon = installed.find((item) => item.id === addonId && item.enabled);
  const catalog =
    addon &&
    addonCatalogs(addon).find(
      (item) => item.type === type && item.id === catalogId,
    );
  useEffect(() => {
    onReady?.();
  }, [onReady]);
  return (
    <section className="mx-auto w-full max-w-[1440px] px-6 py-8 md:px-10 lg:px-12">
      <Link to="/addons" className="text-sm text-sky-300 underline">
        Manage add-ons
      </Link>
      {catalog ? (
        <Catalog
          key={`${addonId}:${type}:${catalogId}`}
          addon={addon}
          catalog={catalog}
        />
      ) : (
        <p className="mt-6" role="status">
          This catalog is unavailable. Install or enable its add-on first.
        </p>
      )}
    </section>
  );
}
