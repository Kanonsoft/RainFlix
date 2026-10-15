import { useEffect, useState } from "react";
import { handoffPlayback } from "../lib/playback-handoff.js";
import { useLocation, useParams, useSearchParams } from "react-router";
import { supports, useAddons, useAddonRestoring } from "../lib/addons.js";
import {
  addonPreview,
  getAddonMeta,
  canUseTmdbMetadata,
  getTmdbAddonMeta,
} from "../lib/addon-catalogs.js";
import TitleDetails from "../components/TitleDetails.jsx";

function Title({ owner, type, id, installed, onBackdrop, onReady }) {
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const requestedVideo = params.get("video");
  const season = requestedVideo?.startsWith(`${id}:`)
    ? Number.parseInt(requestedVideo.split(":")[1], 10) || 1
    : 1;
  const hasTmdb = canUseTmdbMetadata(type, id);
  const metadataProvider = supports(owner, "meta", type, id)
    ? owner
    : installed.find((addon) => supports(addon, "meta", type, id));
  const [feed, setFeed] = useState({ loading: true });
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setFeed((current) => (current.meta ? current : { loading: true }));
    const load = async () => {
      if (hasTmdb)
        return getTmdbAddonMeta(owner, type, id, season, controller.signal);
      if (metadataProvider) {
        const meta = await getAddonMeta(
          metadataProvider,
          owner,
          type,
          id,
          controller.signal,
        );
        return { ...meta, addonStreamOwner: metadataProvider.id };
      }
      return addonPreview(owner, type, id);
    };
    load()
      .then((meta) => {
        if (!controller.signal.aborted) setFeed({ loading: false, meta });
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setFeed({ loading: false, error: error.message });
      })
      .finally(() => {
        if (!controller.signal.aborted) onReady?.();
      });
    return () => controller.abort();
  }, [owner, type, id, hasTmdb, metadataProvider, season, revision, onReady]);
  return (
    <TitleDetails
      feed={feed}
      onRetry={() => setRevision((value) => value + 1)}
      onBackdrop={onBackdrop}
      requestedVideo={requestedVideo}
      onVideoChange={(video, autoplay = false, playback, selectionPhase) => {
        const next = new URLSearchParams(params);
        next.set("video", video);
        next.delete("play");
        if (selectionPhase) next.set("selection", selectionPhase);
        if (autoplay || playback) {
          next.delete("selection");
          next.delete("provider");
        }
        if (autoplay) next.set("resume", "1");
        else next.delete("resume");
        if (selectionPhase && params.get("selection") === "episodes") {
          const previous = new URLSearchParams(next);
          previous.set("selection", "episodes");
          setParams(previous, { replace: true, state: location.state });
        }
        setParams(next, {
          replace: !selectionPhase,
          state: playback
            ? {
                rainflixEpisodePlayback: handoffPlayback(playback),
                rainflixSelectionRoot: location.state?.rainflixSelectionRoot,
              }
            : selectionPhase
              ? {
                  rainflixSelection: true,
                  rainflixSelectionRoot: location.state?.rainflixSelectionRoot,
                }
              : next.has("selection")
                ? location.state
                : null,
        });
      }}
    />
  );
}

export default function AddonTitlePage({ onReady, onBackdrop }) {
  const { addonId, type, id } = useParams();
  const installed = useAddons();
  const restoring = useAddonRestoring();
  const owner = installed.find(
    (addon) => addon.enabled && addon.id === addonId,
  );
  useEffect(() => {
    onReady?.();
  }, [onReady]);
  return owner ? (
    <Title
      key={`${addonId}:${type}:${id}`}
      onReady={onReady}
      onBackdrop={onBackdrop}
      owner={owner}
      type={type}
      id={id}
      installed={installed}
    />
  ) : (
    <section className="mx-auto max-w-[1440px] px-6 py-12" role="status">
      {restoring
        ? "Restoring add-ons..."
        : "This add-on is no longer installed or enabled."}
    </section>
  );
}
