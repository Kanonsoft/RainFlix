import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
} from "react";
import { useLocation, useNavigate } from "react-router";
import { watchPath } from "../../lib/api.js";

const DetailsContext = createContext(null);

export function DetailsProvider({ children }) {
  const navigate = useNavigate();
  const location = useLocation();
  const openDetails = useCallback(
    (mediaType, id) => navigate(watchPath({ mediaType, id })),
    [navigate],
  );
  const value = useMemo(() => ({ openDetails }), [openDetails]);

  // Preserve old shared preview links without keeping a second details UI.
  useEffect(() => {
    const preview = new URLSearchParams(location.search).get("preview") || "";
    const match = /^(movie|tv)-(\d+)$/.exec(preview);
    if (match)
      navigate(watchPath({ mediaType: match[1], id: match[2] }), {
        replace: true,
      });
  }, [location.search, navigate]);

  return (
    <DetailsContext.Provider value={value}>{children}</DetailsContext.Provider>
  );
}

export function useDetails() {
  const context = useContext(DetailsContext);
  if (!context)
    throw new Error("useDetails must be used inside DetailsProvider.");
  return context;
}
