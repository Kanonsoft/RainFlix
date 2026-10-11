import { useEffect, useState } from "react";
import { ArrowUp } from "lucide-react";
import { useAppSettings } from "../lib/app-settings.js";

export default function BackToTop() {
  const [visible, setVisible] = useState(false);
  const { reduceAnimations } = useAppSettings();
  useEffect(() => {
    const scroll = () =>
      setVisible(window.scrollY > Math.max(600, window.innerHeight));
    window.addEventListener("scroll", scroll, { passive: true });
    scroll();
    return () => window.removeEventListener("scroll", scroll);
  }, []);
  if (!visible) return null;
  return (
    <button
      type="button"
      aria-label="Back to top"
      title="Back to top"
      className="fixed bottom-6 right-5 z-40 grid h-11 w-11 place-items-center rounded-full border border-white/20 bg-zinc-900/95 text-sky-300 shadow-xl hover:bg-zinc-800 focus-visible:ring-2 focus-visible:ring-sky-400"
      onClick={() =>
        window.scrollTo({
          top: 0,
          behavior: reduceAnimations ? "auto" : "smooth",
        })
      }
    >
      <ArrowUp size={20} />
    </button>
  );
}
