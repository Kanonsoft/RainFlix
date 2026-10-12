import { useCallback } from "react";
import { useLocation, useNavigate } from "react-router";
import { isNativeApp } from "../platform/index.js";

export function backFallback(pathname) {
  if (
    isNativeApp &&
    (pathname === "/addons" || pathname.startsWith("/settings/"))
  )
    return "/settings";
  const similar = /^\/similar\/(movie|tv)\/(\d+)$/.exec(pathname);
  if (similar) return `/title/${similar[1]}/${similar[2]}`;
  if (pathname.startsWith("/addon/") && pathname.includes("/catalog/"))
    return "/addons";
  if (pathname === "/downloads") return isNativeApp ? "/home" : "/about";
  return "/home";
}
export default function useSmartBack(fallback) {
  const location = useLocation(),
    navigate = useNavigate();
  return useCallback(() => {
    if (Number(window.history.state?.idx) > 0) {
      navigate(-1);
      return true;
    }
    const target = fallback || backFallback(location.pathname);
    if (
      location.pathname === target ||
      (!isNativeApp && location.pathname === "/about")
    )
      return false;
    navigate(target, { replace: true });
    return true;
  }, [fallback, location.pathname, navigate]);
}
