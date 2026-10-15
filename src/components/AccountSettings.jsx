import { useState } from "react";
import {
  accountConfigured,
  useAccount,
  signInWithGoogle,
  signOutAccount,
  saveSyncOptions,
} from "../lib/account-sync.js";
import googleLogo from "../../assets/google-g.png";

const categories = [
  ["list", "My List"],
  ["history", "Continue Watching & playback progress"],
  ["watched", "Watched history"],
  ["settings", "Playback & subtitle preferences"],
  ["addons", "Installed add-ons"],
];

export default function AccountSettings() {
  const account = useAccount();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const run = async (action) => {
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      await action();
    } catch {
      setMessage(
        "Unable to complete this request. Check your connection and Google sign-in setup, then try again.",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <section
      aria-labelledby="accountHeading"
      className="mt-9 border-b border-white/10 pb-6"
    >
      <h2 id="accountHeading" className="text-lg font-semibold text-sky-200">
        Your account
      </h2>
      {!accountConfigured ? (
        <p className="mt-3 text-slate-300">
          Account sync is not configured yet.
        </p>
      ) : account.user ? (
        <>
          <p className="mt-3 break-all">{account.user.email}</p>
          <p className="mt-2 text-sm text-slate-300">
            {account.enabled ? "Sync is on" : "Sync is off"}
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              className="min-h-11 rounded border border-red-400/35 bg-red-500/15 px-4 py-2 text-sm font-semibold text-red-200 hover:bg-red-500/25 disabled:opacity-50"
              aria-busy={busy}
              onClick={() => run(signOutAccount)}
            >
              Sign out
            </button>
          </div>
          <p className="mt-3 text-sm text-slate-400">
            Signing out keeps this device&apos;s library. Fullscreen, animation
            and cache settings stay on this device.
          </p>
        </>
      ) : (
        <button
          className="mt-5 inline-flex min-h-11 max-w-full items-center justify-center gap-3 rounded border border-[#747775] bg-white px-4 py-2.5 text-sm font-medium text-[#1f1f1f] shadow-sm disabled:opacity-50 focus-visible:outline-sky-400"
          disabled={busy || account.busy}
          onClick={() => run(signInWithGoogle)}
        >
          <img
            src={googleLogo}
            width="20"
            height="20"
            alt=""
            draggable={false}
            className="h-5 w-5 shrink-0"
          />
          {busy || account.busy ? "Opening Google..." : "Continue with Google"}
        </button>
      )}
      <fieldset className="mt-9">
        <legend className="text-lg font-semibold text-sky-200">
          Sync preferences
        </legend>
        {categories.map(([key, label]) => (
          <label
            key={key}
            className="flex min-h-16 items-center justify-between gap-5 border-b border-white/10 py-4"
          >
            <span>{label}</span>
            <input
              type="checkbox"
              role="switch"
              checked={account.options[key]}
              onChange={(event) =>
                saveSyncOptions({ [key]: event.target.checked })
              }
              className="h-5 w-9 shrink-0 accent-sky-400"
            />
          </label>
        ))}
      </fieldset>
      <p className="mt-4 text-sm leading-6 text-slate-400">
        Signing in automatically merges this device and syncs the selected
        categories. Add-on sync includes configuration links, which may contain
        private tokens, in your private cloud account. It is not end-to-end
        encrypted. Turning a category off leaves its existing cloud data
        unchanged.
      </p>
      {(message || account.error) && (
        <p role="alert" className="mt-3 text-sm text-red-300">
          {message || account.error}
        </p>
      )}
    </section>
  );
}
