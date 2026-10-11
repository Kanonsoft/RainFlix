import { useEffect, useState } from "react";
import { ExternalLink, LoaderCircle, RotateCcw } from "lucide-react";
import { api } from "../lib/api.js";
import {
  countryName,
  detectViewingCountry,
  officialProviders,
} from "../lib/official-providers.js";

export default function OfficialProviders({ details }) {
  const tmdb = details.tmdbDetails;
  const id = tmdb?.id;
  const mediaType = tmdb?.mediaType;
  const [location, setLocation] = useState({ loading: true, region: null });
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState({ loading: true, results: {}, error: "" });
  useEffect(() => {
    if (!id) return;
    let active = true;
    detectViewingCountry().then((region) => {
      if (active) setLocation({ loading: false, region });
    });
    return () => {
      active = false;
    };
  }, [id]);
  useEffect(() => {
    if (!id) return;
    let active = true;
    setState({ loading: true, results: {}, error: "" });
    const timer = window.setTimeout(() => {
      if (!active) return;
      active = false;
      setState({
        loading: false,
        results: {},
        error: "Availability timed out.",
      });
    }, 10000);
    api.getWatchProviders(mediaType, id).then(
      (results) => {
        if (!active) return;
        window.clearTimeout(timer);
        setState({ loading: false, results, error: "" });
      },
      () => {
        if (!active) return;
        window.clearTimeout(timer);
        setState({
          loading: false,
          results: {},
          error: "Availability unavailable.",
        });
      },
    );
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [id, mediaType, revision]);
  if (!id) return null;
  const { region } = location;
  const providers = officialProviders(state.results, region);
  return (
    <>
      {state.loading || location.loading ? (
        <p
          role="status"
          className="flex items-center gap-2 py-3 text-sm text-slate-400"
        >
          <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
          Checking availability...
        </p>
      ) : !region ? (
        <p role="status" className="py-3 text-sm text-slate-400">
          Could not determine regional availability.
        </p>
      ) : state.error ? (
        <div className="flex items-center justify-between gap-2 py-3">
          <p role="status" className="text-sm text-slate-400">
            {state.error}
          </p>
          <button
            aria-label="Retry official availability"
            title="Retry official availability"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-lg hover:bg-white/10"
            onClick={() => setRevision((value) => value + 1)}
          >
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      ) : providers.length ? (
        <div className="grid min-w-0 gap-1">
          {providers.map((provider) => (
            <a
              key={provider.id}
              href={provider.link}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`${provider.name}: ${provider.offers.join(", ")} (opens TMDb viewing options)`}
              title="View official links on TMDb"
              className="flex min-h-16 min-w-0 items-center gap-3 rounded-lg px-3 py-2 transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
            >
              {provider.logo ? (
                <img
                  src={provider.logo}
                  alt=""
                  draggable={false}
                  className="h-10 w-10 shrink-0 rounded-lg object-contain"
                  onError={(event) => {
                    event.currentTarget.style.visibility = "hidden";
                  }}
                />
              ) : (
                <span className="h-10 w-10 shrink-0" />
              )}
              <span className="min-w-0 flex-1">
                <span className="block break-words text-sm font-bold">
                  {provider.name}
                </span>
                <span className="block break-words text-xs text-slate-400">
                  {provider.offers.join(" \u00b7 ")}
                </span>
              </span>
              <ExternalLink
                className="h-4 w-4 shrink-0 text-slate-400"
                aria-hidden="true"
              />
            </a>
          ))}
        </div>
      ) : (
        <p role="status" className="py-3 text-sm text-slate-400">
          No official availability listed in {countryName(region)}.
        </p>
      )}
    </>
  );
}
