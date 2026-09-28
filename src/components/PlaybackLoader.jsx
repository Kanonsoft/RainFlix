import { useState } from "react";

export default function PlaybackLoader({
  active,
  title,
  logo,
  progress = null,
  message = "Buffering video",
}) {
  const [failedLogo, setFailedLogo] = useState("");
  const artwork = logo && logo !== failedLogo;
  const amount = Number.isFinite(progress)
    ? Math.max(0, Math.min(100, Math.round(progress * 100)))
    : null;
  const layer = () =>
    artwork ? (
      <img
        src={logo}
        alt=""
        draggable={false}
        className="mx-auto max-h-36 w-auto max-w-full object-contain"
        onError={() => setFailedLogo(logo)}
      />
    ) : (
      <span className="block break-words text-2xl font-bold leading-tight text-white sm:text-3xl">
        {title || "RainFlix"}
      </span>
    );

  return (
    <div
      className={`playback-loader pointer-events-none absolute inset-0 z-10 grid place-items-center bg-black/65 p-6 transition-opacity duration-200 ${active ? "opacity-100" : "opacity-0"}`}
      role="progressbar"
      aria-label={`${title || "RainFlix"}: ${message}`}
      aria-hidden={!active}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={amount ?? undefined}
      aria-valuetext={message}
      data-buffering={active}
    >
      <div
        className={`playback-logo relative w-full max-w-sm text-center ${active ? "is-buffering" : ""}`}
        aria-hidden="true"
      >
        <div className="opacity-25">{layer()}</div>
        <div
          className="playback-logo-fill absolute inset-0"
          style={{ clipPath: `inset(0 ${100 - (amount ?? 0)}% 0 0)` }}
        >
          {layer()}
        </div>
      </div>
    </div>
  );
}
