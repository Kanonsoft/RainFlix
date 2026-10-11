import { useEffect, useState } from "react";
import { LoaderCircle, RotateCcw } from "lucide-react";
import windowsLogo from "../../assets/windows.svg";
import androidLogo from "../../assets/android.svg";
import { api, config } from "../lib/api.js";
import { releaseRepository, platformReleases } from "../lib/downloads.js";
import { usePageMetadata } from "../lib/metadata.js";

const platforms = [
  {
    id: "windows",
    name: "Windows",
    logo: windowsLogo,
    description: "Desktop app · 64-bit installer",
  },
  {
    id: "android",
    name: "Android",
    logo: androidLogo,
    description: "Mobile app · APK installer",
  },
];

export default function DownloadsPage({ onReady, onBackdrop }) {
  const repository = releaseRepository(config);
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState({
    loading: true,
    releases: {},
    error: false,
  });
  usePageMetadata({
    title: "Download RainFlix",
    description: "Download RainFlix for Windows and Android.",
  });
  useEffect(() => {
    onReady?.();
  }, [onReady]);
  useEffect(() => {
    if (!onBackdrop) return;
    let active = true;
    api
      .getTrendingMovies(api.PAGE_SIZE)
      .then((feed) => {
        const title = feed.items[0];
        if (active) onBackdrop(title?.backdrop || title?.poster);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [onBackdrop]);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setState({ loading: true, releases: {}, error: false });
    const timer = window.setTimeout(() => controller.abort(), 8000);
    platformReleases(repository, controller.signal)
      .then(
        (releases) => {
          if (active) setState({ loading: false, releases, error: false });
        },
        () => {
          if (active) setState({ loading: false, releases: {}, error: true });
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
      <h1 id="downloadsHeading" className="mt-6 text-3xl font-bold text-white">
        Downloads
      </h1>
      <div className="mt-8 divide-y divide-white/10 border-y border-white/10">
        {platforms.map((platform) => {
          const release = state.releases[platform.id];
          return (
            <section
              key={platform.id}
              aria-labelledby={`${platform.id}Heading`}
              className="flex min-h-40 flex-wrap items-center justify-between gap-5 py-8"
            >
              <div className="flex min-w-0 items-center gap-4">
                <img
                  src={platform.logo}
                  alt={`${platform.name} logo`}
                  draggable={false}
                  className="h-9 w-9 shrink-0 object-contain"
                />
                <div className="min-w-0">
                  <h2
                    id={`${platform.id}Heading`}
                    className="text-xl font-bold"
                  >
                    {platform.name}
                  </h2>
                  <p className="mt-2 text-sm text-slate-300">
                    {platform.description}
                  </p>
                  {release && (
                    <p className="mt-2 break-words text-xs text-slate-400">
                      {[release.version, release.size]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  )}
                </div>
              </div>
              <div className="ml-auto flex min-w-0 max-w-full items-center justify-end sm:max-w-80">
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
                ) : release ? (
                  <a
                    href={release.url}
                    className="inline-flex min-h-12 items-center justify-center rounded-lg bg-sky-400 px-5 text-sm font-bold text-slate-950 transition hover:bg-sky-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
                  >
                    Download for {platform.name}
                  </a>
                ) : (
                  <div className="flex items-center gap-2">
                    <p
                      role="status"
                      className="text-right text-sm text-slate-400"
                    >
                      {state.error
                        ? `Couldn't check the ${platform.name} installer.`
                        : `${platform.name} installer not published yet.`}
                    </p>
                    {state.error && (
                      <button
                        type="button"
                        aria-label={`Retry ${platform.name} release lookup`}
                        title="Retry release lookup"
                        className="grid h-11 w-11 shrink-0 place-items-center rounded-lg hover:bg-white/10"
                        onClick={() => setRevision((value) => value + 1)}
                      >
                        <RotateCcw className="h-4 w-4" aria-hidden="true" />
                      </button>
                    )}
                  </div>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </section>
  );
}
