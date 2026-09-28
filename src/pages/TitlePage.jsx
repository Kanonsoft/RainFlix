import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router";
import { api } from "../lib/api.js";
import { getTmdbTitleMeta } from "../lib/addon-catalogs.js";
import TitleDetails from "../components/TitleDetails.jsx";

function Title({ mediaType, id, onReady, onBackdrop }) {
  const [params, setParams] = useSearchParams();
  const season = Math.max(1, Number.parseInt(params.get("season"), 10) || 1);
  const episode = Math.max(1, Number.parseInt(params.get("episode"), 10) || 1);
  const [feed, setFeed] = useState({ loading: true });
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setFeed({ loading: true });
    const load = async () => {
      if (!["movie", "tv"].includes(mediaType) || !/^\d+$/.test(id))
        throw new Error("This title is unavailable.");
      const details = await api.getDetails(mediaType, id);
      if (!details) throw new Error("RainFlix could not find this title.");
      if (controller.signal.aborted) return;
      const meta = await getTmdbTitleMeta(details, season, controller.signal);
      if (!controller.signal.aborted) setFeed({ loading: false, meta });
    };
    load()
      .catch((error) => {
        if (!controller.signal.aborted)
          setFeed({ loading: false, error: error.message });
      })
      .finally(() => {
        if (!controller.signal.aborted) onReady?.();
      });
    return () => controller.abort();
  }, [mediaType, id, season, revision, onReady]);

  const requestedVideo = feed.meta?.videos?.find(
    (video) => video.season === season && video.episode === episode,
  )?.id;
  return (
    <TitleDetails
      feed={feed}
      onRetry={() => setRevision((value) => value + 1)}
      onBackdrop={onBackdrop}
      requestedVideo={requestedVideo}
      onVideoChange={(video) => {
        const parts = video.split(":");
        const next = new URLSearchParams(params);
        next.set("season", parts.at(-2));
        next.set("episode", parts.at(-1));
        next.delete("play");
        setParams(next);
      }}
    />
  );
}

export default function TitlePage(props) {
  const { mediaType, id } = useParams();
  return (
    <Title
      key={`${mediaType}:${id}`}
      {...props}
      mediaType={mediaType}
      id={id}
    />
  );
}
