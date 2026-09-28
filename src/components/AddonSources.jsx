import { useEffect, useMemo, useRef, useState } from "react";
import { ExternalLink, LoaderCircle, Play, RefreshCw } from "lucide-react";
import { config } from "../lib/api.js";
import { addonProvider } from "../lib/addons.js";
import { getYastreamStreams, getYastreamSubtitles } from "../lib/yastream.js";
import { getTorrentioStreams } from "../lib/torrentio.js";
import {
  readTorrentPlaybackMode,
  saveTorrentPlaybackMode,
  withBrowserTorrent,
} from "../lib/browser-torrent.js";
import {
  readServiceConnection,
  saveServiceConnection,
  withStremioService,
} from "../lib/stremio-service.js";
import TorrentPlaybackSettings from "./TorrentPlaybackSettings.jsx";

const providers = {
  yastream: {
    label: "Yastream",
    getStreams: getYastreamStreams,
    getSubtitles: getYastreamSubtitles,
  },
  torrentio: { label: "Torrentio", getStreams: getTorrentioStreams },
};
const defaultSettings = {};

export default function AddonSources({
  source,
  details,
  season,
  episode,
  onPlay,
  onReady,
  visible = true,
  revision = 0,
}) {
  const provider = useMemo(
    () => (source.addon ? addonProvider(source.addon) : providers[source.id]),
    [source.addon, source.id],
  );
  const settings = config[source.id] || defaultSettings;
  const [retry, setRetry] = useState(0);
  const [feed, setFeed] = useState({ loading: true, streams: [] });
  const [mode, setMode] = useState(readTorrentPlaybackMode);
  const [connection, setConnection] = useState(readServiceConnection);
  const autoHandled = useRef(false);
  const requestKey = `${revision}:${retry}`;
  const loading = feed.loading || feed.requestKey !== requestKey;
  useEffect(() => {
    const controller = new AbortController();
    autoHandled.current = false;
    setFeed({ loading: true, streams: [] });
    provider
      .getStreams(details, season, episode, controller.signal)
      .then((streams) => {
        if (!controller.signal.aborted)
          setFeed({ loading: false, streams, requestKey });
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setFeed({
            loading: false,
            streams: [],
            error: error.message,
            requestKey,
          });
      });
    return () => controller.abort();
  }, [provider, details, season, episode, requestKey]);

  const streams = useMemo(
    () =>
      feed.streams.map((stream) => {
        if (!stream.torrent) return stream;
        if (mode === "browser" && config.webTorrent?.enabled !== false)
          return withBrowserTorrent(stream);
        if (mode === "stremio")
          return withStremioService(stream, { ...connection, enabled: true });
        return stream;
      }),
    [feed.streams, mode, connection],
  );
  useEffect(() => {
    if (loading || autoHandled.current) return;
    if (streams.length !== 1 || streams[0].blockedReason) {
      autoHandled.current = true;
      onReady?.();
      return;
    }
    // Only a fresh provider lookup can auto-start its sole stream, never a settings change.
    const timer = window.setTimeout(() => {
      autoHandled.current = true;
      onPlay({ stream: streams[0], provider, settings, details }, true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loading, streams, provider, settings, details, onPlay, onReady]);

  if (
    !visible ||
    (!loading &&
      streams.length === 1 &&
      !streams[0].blockedReason &&
      !autoHandled.current)
  )
    return null;

  return (
    <section aria-label={`${provider.label} streams`} className="min-w-0">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h3 className="min-w-0 break-words text-sm font-bold">Streams</h3>
        <button
          type="button"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-lg text-sky-300 hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-sky-400"
          aria-label="Refresh streams"
          title="Refresh streams"
          onClick={() => setRetry((value) => value + 1)}
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      {loading ? (
        <p
          role="status"
          className="flex items-center gap-2 py-4 text-sm text-slate-400"
        >
          <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
          Finding streams
        </p>
      ) : !streams.length ? (
        <div className="py-3 text-sm">
          <p role="status" className="text-slate-400">
            {feed.error ||
              `No streams found for this title on ${provider.label}.`}
          </p>
          <button
            className="mt-2 min-h-11 text-sky-300 underline"
            onClick={() => setRetry((value) => value + 1)}
          >
            Retry
          </button>
        </div>
      ) : (
        <div className="grid min-w-0 gap-2">
          {streams.map((stream) => (
            <div key={stream.id} className="min-w-0">
              {stream.blockedReason ? (
                <div className="border-b border-white/10 py-3 text-sm">
                  <p className="break-words font-bold text-slate-200">
                    {stream.label}
                  </p>
                  <p className="mt-1 break-words text-xs leading-5 text-slate-400">
                    {stream.blockedReason}
                  </p>
                  {stream.externalUrl && (
                    <a
                      className="mt-2 inline-flex min-h-10 items-center gap-2 text-sky-300 underline"
                      href={stream.externalUrl}
                      rel="noreferrer"
                      data-stream-id={stream.id}
                    >
                      <ExternalLink className="h-4 w-4" aria-hidden="true" />
                      {stream.externalUrl.startsWith("magnet:")
                        ? "Open torrent"
                        : "Open stream"}
                    </a>
                  )}
                </div>
              ) : (
                <button
                  type="button"
                  data-stream-id={stream.id}
                  className="flex min-h-12 w-full min-w-0 items-start gap-3 rounded-lg border border-white/15 px-3 py-3 text-left text-sm transition hover:border-sky-400 hover:bg-white/5 focus-visible:ring-2 focus-visible:ring-sky-400"
                  onClick={() =>
                    onPlay({ stream, provider, settings, details })
                  }
                >
                  <Play
                    className="mt-0.5 h-4 w-4 shrink-0 text-sky-300"
                    aria-hidden="true"
                  />
                  <span className="min-w-0 whitespace-pre-line break-words">
                    {stream.label}
                  </span>
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      {(source.id === "torrentio" ||
        feed.streams.some((stream) => stream.torrent)) && (
        <TorrentPlaybackSettings
          mode={mode}
          onModeChange={(value) => {
            autoHandled.current = true;
            saveTorrentPlaybackMode(value);
            setMode(value);
          }}
          serviceConnection={connection}
          onServiceChange={(value) => {
            autoHandled.current = true;
            saveServiceConnection(value);
            setConnection(value);
          }}
        />
      )}
    </section>
  );
}
