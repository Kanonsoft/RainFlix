import { config } from "../lib/api.js";
import StremioServiceSettings from "./StremioServiceSettings.jsx";

export default function TorrentPlaybackSettings({
  mode,
  onModeChange,
  serviceConnection,
  onServiceChange,
}) {
  return (
    <div className="min-w-0 border-t border-blue-900/70 p-3">
      <label className="grid min-w-0 gap-2 text-xs font-bold text-slate-400">
        Torrent playback
        <select
          className="h-11 w-full min-w-0 rounded-lg border border-blue-900/80 bg-slate-950 px-3 text-sm text-slate-100 outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-400/20"
          value={mode}
          onChange={(event) => onModeChange(event.target.value)}
        >
          <option
            value="browser"
            disabled={config.webTorrent?.enabled === false}
          >
            Browser (WebRTC only)
          </option>
          <option value="stremio">Stremio Service</option>
          <option value="external">External torrent app</option>
        </select>
      </label>
      {mode === "stremio" ? (
        <StremioServiceSettings
          connection={{ ...serviceConnection, enabled: true }}
          onChange={onServiceChange}
          showToggle={false}
        />
      ) : null}
    </div>
  );
}
