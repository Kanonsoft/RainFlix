import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Check, RotateCcw, Trash2 } from "lucide-react";
import { useLibrary } from "./library/LibraryProvider.jsx";

export default function HistoryMenu({ item, position, onClose }) {
  const menu = useRef(null);
  const { markTitleWatched, markUnwatched, removeWatched, removeFromHistory } =
    useLibrary();
  useEffect(() => {
    const origin = document.activeElement;
    menu.current
      ?.querySelector('[role="menuitem"]')
      ?.focus({ preventScroll: true });
    const dismiss = (event) => {
      if (!menu.current?.contains(event.target)) onClose();
    };
    const close = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        origin?.focus();
      }
    };
    window.addEventListener("pointerdown", dismiss);
    window.addEventListener("keydown", close);
    window.addEventListener("resize", onClose);
    window.addEventListener("wheel", onClose, { passive: true });
    window.addEventListener("touchmove", onClose, { passive: true });
    return () => {
      window.removeEventListener("pointerdown", dismiss);
      window.removeEventListener("keydown", close);
      window.removeEventListener("resize", onClose);
      window.removeEventListener("wheel", onClose);
      window.removeEventListener("touchmove", onClose);
    };
  }, [onClose]);
  const action = (callback) => {
    callback();
    onClose();
  };
  const buttonClass =
    "flex min-h-11 w-full items-center gap-3 px-4 py-2 text-left text-sm hover:bg-white/10 focus:bg-white/10 focus:outline-none";
  const isWatched = item.historyKind === "watched";
  return createPortal(
    <div
      ref={menu}
      role="menu"
      aria-label={`${item.title} history`}
      className="fixed z-[100] w-60 overflow-hidden rounded-lg border border-white/20 bg-zinc-950 text-white shadow-2xl"
      style={{
        left: Math.max(8, Math.min(position.x, window.innerWidth - 248)),
        top: Math.max(8, Math.min(position.y, window.innerHeight - 150)),
      }}
      onKeyDown={(event) => {
        const items = [...menu.current.querySelectorAll('[role="menuitem"]')];
        const index = items.indexOf(document.activeElement);
        if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
          event.preventDefault();
          const next =
            event.key === "Home"
              ? 0
              : event.key === "End"
                ? items.length - 1
                : (index +
                    (event.key === "ArrowDown" ? 1 : -1) +
                    items.length) %
                  items.length;
          items[next]?.focus();
        } else if (event.key === "Tab") onClose();
      }}
    >
      <button
        role="menuitem"
        className={buttonClass}
        onClick={() =>
          action(() =>
            isWatched ? markUnwatched(item) : markTitleWatched(item),
          )
        }
      >
        {isWatched ? <RotateCcw size={16} /> : <Check size={16} />}
        {isWatched ? "Mark as unwatched" : "Mark as watched"}
      </button>
      <button
        role="menuitem"
        className={`${buttonClass} text-rose-300`}
        onClick={() =>
          action(() =>
            isWatched ? removeWatched(item) : removeFromHistory(item),
          )
        }
      >
        <Trash2 size={16} />
        {isWatched ? "Remove from watched" : "Remove from history"}
      </button>
    </div>,
    document.body,
  );
}
