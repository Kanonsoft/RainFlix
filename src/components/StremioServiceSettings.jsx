import { useEffect, useRef, useState } from "react";
import { ExternalLink, LoaderCircle, Plug } from "lucide-react";
import {
  checkStremioService,
  normalizeServiceUrl,
} from "../lib/stremio-service.js";

export default function StremioServiceSettings({
  connection,
  onChange,
  showToggle = true,
}) {
  const [address, setAddress] = useState(connection.baseUrl);
  const [status, setStatus] = useState({ kind: "idle", text: "Not checked" });
  const [validation, setValidation] = useState("");
  const pending = useRef(null);
  useEffect(() => () => pending.current?.abort(), []);

  const cancelCheck = () => {
    pending.current?.abort();
    setStatus({ kind: "idle", text: "Not checked" });
  };

  const connect = async (event) => {
    event.preventDefault();
    cancelCheck();
    setValidation("");
    let baseUrl;
    try {
      baseUrl = normalizeServiceUrl(address);
    } catch (error) {
      setValidation(error.message);
      return;
    }
    setAddress(baseUrl);
    onChange({ enabled: true, baseUrl });
    const controller = new AbortController();
    pending.current = controller;
    setStatus({ kind: "checking", text: "Checking service" });
    try {
      const service = await checkStremioService(baseUrl, controller.signal);
      if (!controller.signal.aborted)
        setStatus({ kind: "online", text: `Connected (v${service.version})` });
    } catch (error) {
      if (!controller.signal.aborted)
        setStatus({ kind: "error", text: error.message });
    }
  };

  return (
    <div
      className={
        showToggle ? "min-w-0 border-t border-blue-900/70 p-3" : "mt-3 min-w-0"
      }
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        {showToggle ? (
          <label className="inline-flex min-h-10 items-center gap-2 text-sm font-bold text-slate-200">
            <input
              type="checkbox"
              checked={connection.enabled}
              className="h-4 w-4 accent-sky-400"
              onChange={(event) => {
                cancelCheck();
                setValidation("");
                onChange({ ...connection, enabled: event.target.checked });
              }}
            />
            Use Stremio Service
          </label>
        ) : (
          <span className="text-xs font-bold text-slate-400">
            Local service
          </span>
        )}
        <a
          href="https://www.stremio.com/download-service"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-10 items-center gap-1.5 text-xs font-bold text-sky-300 hover:text-sky-200"
        >
          <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" /> Get
          Stremio Service
        </a>
      </div>
      {connection.enabled || !showToggle ? (
        <form onSubmit={connect} className="mt-2 grid min-w-0 gap-2">
          <label
            htmlFor="stremioServiceUrl"
            className="text-xs font-bold text-slate-400"
          >
            Service address
          </label>
          <div className="flex min-w-0 flex-wrap gap-2">
            <input
              id="stremioServiceUrl"
              type="url"
              required
              value={address}
              autoComplete="off"
              spellCheck={false}
              aria-invalid={Boolean(validation)}
              aria-describedby={validation ? "stremioAddressError" : undefined}
              onChange={(event) => {
                cancelCheck();
                setValidation("");
                setAddress(event.target.value);
              }}
              className="h-11 min-w-0 flex-1 basis-48 rounded-lg border border-blue-900/80 bg-slate-950 px-3 text-sm text-slate-100 outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-400/20"
            />
            <button
              type="submit"
              disabled={status.kind === "checking"}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-sky-500/60 px-3 text-sm font-bold text-sky-200 hover:bg-sky-400/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 disabled:opacity-50"
            >
              {status.kind === "checking" ? (
                <LoaderCircle
                  className="h-4 w-4 animate-spin"
                  aria-hidden="true"
                />
              ) : (
                <Plug className="h-4 w-4" aria-hidden="true" />
              )}
              Connect
            </button>
          </div>
          {validation ? (
            <p
              id="stremioAddressError"
              role="alert"
              className="break-words text-xs text-amber-200"
            >
              {validation}
            </p>
          ) : null}
          <p
            role="status"
            className={`break-words text-xs ${status.kind === "error" ? "text-amber-200" : status.kind === "online" ? "text-emerald-300" : "text-slate-400"}`}
          >
            {status.text}
          </p>
          {status.kind === "error" ? (
            <p className="text-xs text-slate-400">
              The API check can be blocked by browser permissions or CORS.
              Native video may still work while Stremio is running.
            </p>
          ) : null}
        </form>
      ) : null}
    </div>
  );
}
