import { Component } from "react";
import { RefreshCw, Trash2 } from "lucide-react";
import rainflixLogo from "../../assets/rainflix-r.png";

const CACHE_KEYS = ["rainflix:title-logos:v1"];
const CACHE_PREFIXES = ["rainflix:tmdb:v1:"];

function clearRainFlixCache() {
  try {
    const keys = Array.from(
      { length: window.localStorage.length },
      (_, index) => window.localStorage.key(index),
    ).filter(Boolean);

    keys
      .filter(
        (key) =>
          CACHE_KEYS.includes(key) ||
          CACHE_PREFIXES.some((prefix) => key.startsWith(prefix)),
      )
      .forEach((key) => window.localStorage.removeItem(key));
  } catch {
    // Recovery still works when storage is disabled.
  }
}

export default class AppErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error(
      "RainFlix encountered an unrecoverable UI error.",
      error,
      info,
    );
  }

  reload = () => {
    window.location.reload();
  };

  clearAndReload = () => {
    clearRainFlixCache();
    window.location.reload();
  };

  render() {
    if (!this.state.error) {
      return this.props.children;
    }

    return (
      <main className="grid min-h-screen place-items-center bg-rain-ink px-5 py-12 text-slate-100">
        <section className="w-full max-w-xl border border-blue-900/70 bg-slate-950/95 p-7 text-center shadow-2xl shadow-black/50 md:p-10">
          <img
            className="mx-auto h-20 w-20 object-contain"
            src={rainflixLogo}
            alt=""
            draggable="false"
          />
          <h1 className="mt-6 text-3xl font-black text-slate-50">
            RainFlix could not finish loading
          </h1>
          <p className="mx-auto mt-4 max-w-md text-sm leading-7 text-slate-400 md:text-base">
            The page hit an unexpected problem. Reload first, or clear only the
            temporary catalog cache if the issue continues. Your saved list and
            viewing history will remain intact.
          </p>
          <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
            <button
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-sky-400 px-5 py-3 text-sm font-black text-slate-950 transition hover:bg-sky-300 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-sky-400/25"
              type="button"
              onClick={this.reload}
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              Reload RainFlix
            </button>
            <button
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-blue-800/80 px-5 py-3 text-sm font-black text-slate-200 transition hover:border-sky-400 hover:text-sky-200 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-sky-400/20"
              type="button"
              onClick={this.clearAndReload}
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
              Clear cache and reload
            </button>
          </div>
        </section>
      </main>
    );
  }
}
