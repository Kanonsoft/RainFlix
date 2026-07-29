import { useEffect } from "react";
import { config } from "../lib/api.js";

const SCRIPT_ID = "rainflix-privacy-analytics";

export default function PrivacyAnalytics() {
  useEffect(() => {
    const scriptUrl = String(config.analyticsScriptUrl || "").trim();
    const websiteId = String(config.analyticsWebsiteId || "").trim();

    if (!scriptUrl || !websiteId || document.querySelector(`#${SCRIPT_ID}`)) {
      return undefined;
    }

    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.defer = true;
    script.src = scriptUrl;
    script.dataset.websiteId = websiteId;
    script.dataset.doNotTrack = "true";
    script.dataset.performance = "true";

    const domains = String(config.analyticsDomains || "").trim();
    if (domains) {
      script.dataset.domains = domains;
    }

    document.head.appendChild(script);
    return () => script.remove();
  }, []);

  return null;
}
