import {
  Bookmark,
  Download,
  House,
  LayoutGrid,
  Settings,
  Sparkles,
} from "lucide-react";
import { Link, useLocation } from "react-router";
import { isNativeApp } from "../platform/index.js";

const destinations = [
  { name: "Home", path: "/home", icon: House },
  { name: "Anime", path: "/anime", icon: Sparkles },
  { name: "Browse", path: "/browse", icon: LayoutGrid },
  ...(!isNativeApp
    ? [{ name: "Downloads", path: "/downloads", icon: Download }]
    : []),
  { name: "My List", path: "/library", icon: Bookmark },
  ...(isNativeApp
    ? [{ name: "Settings", path: "/settings", icon: Settings }]
    : []),
];

export default function MobileNavigation() {
  const location = useLocation();
  if (new URLSearchParams(location.search).has("play")) return null;
  const current =
    location.pathname === "/addons" || location.pathname.startsWith("/settings")
      ? "/settings"
      : /^\/(title|watch|newest|similar|addon)\//.test(location.pathname)
        ? "/browse"
        : location.pathname;
  return (
    <nav
      className="mobile-bottom-nav lg:hidden"
      aria-label="Mobile primary navigation"
    >
      {destinations.map(({ name, path, icon: Icon }) => (
        <Link
          key={path}
          to={path}
          title={name}
          aria-label={name}
          aria-current={current === path ? "page" : undefined}
          className={`mobile-bottom-link${current === path ? " is-active" : ""}`}
        >
          <Icon
            className="h-[22px] w-[22px]"
            aria-hidden="true"
            strokeWidth={current === path ? 2.5 : 1.8}
          />
          <span>{name}</span>
        </Link>
      ))}
    </nav>
  );
}
