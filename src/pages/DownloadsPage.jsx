import { useEffect, useState } from "react";
import {
  Download,
  ExternalLink,
  LoaderCircle,
  Monitor,
  RotateCcw,
  Smartphone,
} from "lucide-react";
import rainflixWordmark from "../../assets/rainflix-wordmark.png";
import { config } from "../lib/api.js";
import { releaseRepository, windowsRelease } from "../lib/downloads.js";
import { usePageMetadata } from "../lib/metadata.js";

const actionClass =
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-lg px-5 text-sm font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400";

export default function DownloadsPage({ onReady }) {
  const repository = releaseRepository(config);
  const releasesUrl = `https://github.com/${repository}/releases`;
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState({
    loading: true,
    release: null,
    error: false,
  });
  usePageMetadata({
    title: "Download RainFlix",
    description: "RainFlix for Windows. Android is coming soon.",
  });
  useEffect(() => {
    onReady?.();
  }, [onReady]);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setState({ loading: true, release: null, error: false });
    const timer = window.setTimeout(() => controller.abort(), 8000);
    windowsRelease(repository, controller.signal)
      .then(
        (release) => {
          if (active) setState({ loading: false, release, error: false });
        },
        () => {
          if (active) setState({ loading: false, release: null, error: true });
        },
      )
      .finally(() => window.clearTimeout(timer));
    return () => {
      active = false;
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [repository, revision]);
  return (
    <section
      aria-labelledby="downloadsHeading"
      className="mx-auto w-full max-w-5xl px-5 py-10 md:px-10 md:py-16"
    >
      <img
        src={rainflixWordmark}
        alt="RainFlix"
        draggable={false}
        className="h-12 max-w-full object-contain object-left md:h-16"
      />
      <h1 id="downloadsHeading" className="mt-6 text-3xl font-bold text-white">
        Downloads
      </h1>
      <div className="mt-8 divide-y divide-white/10 border-y border-white/10">
        <section
          aria-labelledby="windowsHeading"
          className="flex flex-col gap-6 py-8 sm:flex-row sm:items-start sm:justify-between"
        >
          <div className="flex min-w-0 items-start gap-4">
            <Monitor
              className="mt-1 h-8 w-8 shrink-0 text-sky-300"
              aria-hidden="true"
            />
            <div className="min-w-0">
              <h2 id="windowsHeading" className="text-xl font-bold">
                Windows
              </h2>
              <p className="mt-2 text-sm text-slate-300">
                Desktop app &middot; 64-bit installer
              </p>
              {state.release && (
                <p className="mt-2 break-words text-xs text-slate-400">
                  {[state.release.version, state.release.size]
                    .filter(Boolean)
                    .join(" \u00b7 ")}
                </p>
              )}
            </div>
          </div>
          <div className="flex min-w-0 flex-col items-start gap-3 sm:max-w-80 sm:items-end">
            {state.loading ? (
              <p
                role="status"
                className="flex min-h-12 items-center gap-2 text-sm text-slate-400"
              >
                <LoaderCircle
                  className="h-4 w-4 animate-spin"
                  aria-hidden="true"
                />
                Checking latest release...
              </p>
            ) : state.release ? (
              <a
                href={state.release.url}
                className={`${actionClass} w-full bg-sky-400 text-slate-950 hover:bg-sky-300 sm:w-auto`}
              >
                <Download className="h-5 w-5" aria-hidden="true" />
                Download for Windows
              </a>
            ) : (
              <div className="flex items-center gap-2">
                <p role="status" className="text-sm text-slate-400">
                  {state.error
                    ? "Couldn't check the latest installer."
                    : "Windows installer not published yet."}
                </p>
                {state.error && (
                  <button
                    type="button"
                    aria-label="Retry release lookup"
                    title="Retry release lookup"
                    className="grid h-11 w-11 shrink-0 place-items-center rounded-lg hover:bg-white/10"
                    onClick={() => setRevision((value) => value + 1)}
                  >
                    <RotateCcw className="h-4 w-4" aria-hidden="true" />
                  </button>
                )}
              </div>
            )}
            <a
              href={releasesUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center gap-2 text-sm text-slate-300 transition hover:text-sky-200"
            >
              GitHub Releases{" "}
              <ExternalLink className="h-4 w-4" aria-hidden="true" />
            </a>
          </div>
        </section>
        <section
          aria-labelledby="androidHeading"
          className="flex flex-wrap items-center justify-between gap-5 py-8"
        >
          <div className="flex min-w-0 items-start gap-4">
            <Smartphone
              className="mt-1 h-8 w-8 shrink-0 text-emerald-300"
              aria-hidden="true"
            />
            <div>
              <h2 id="androidHeading" className="text-xl font-bold">
                Android
              </h2>
              <p className="mt-2 text-sm text-slate-300">Mobile app</p>
            </div>
          </div>
          <p className="text-sm font-semibold text-slate-400">Coming soon</p>
        </section>
      </div>
    </section>
  );
}
