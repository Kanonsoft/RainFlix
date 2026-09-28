import { useEffect } from "react";
import { config, TELEMETRY_EVENT } from "../lib/api.js";

const SCRIPT_ID = "rainflix-privacy-analytics";

export default function PrivacyAnalytics() {
  useEffect(() => {
    const scriptUrl = String(config.analyticsScriptUrl || "").trim();
    const websiteId = String(config.analyticsWebsiteId || "").trim();

    if (!scriptUrl || !websiteId || document.querySelector(`#${SCRIPT_ID}`)) {
      return undefined;
    }

    const script = document.createElement("script");
    const pendingEvents = [];
    const track = (event) => {
      const { data, name } = event.detail || {};

      if (!name) {
        return;
      }

      if (typeof window.umami?.track === "function") {
        try {
          window.umami.track(name, data);
        } catch {
          // The analytics client is optional and isolated from the UI.
        }
      } else {
        pendingEvents.push({ data, name });
      }
    };

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

    script.addEventListener("load", () => {
      if (typeof window.umami?.track !== "function") {
        pendingEvents.length = 0;
        return;
      }

      pendingEvents.splice(0).forEach(({ data, name }) => {
        try {
          window.umami.track(name, data);
        } catch {
          // Ignore individual analytics failures.
        }
      });
    });
    script.addEventListener("error", () => {
      pendingEvents.length = 0;
    });
    window.addEventListener(TELEMETRY_EVENT, track);
    document.head.appendChild(script);
    return () => {
      window.removeEventListener(TELEMETRY_EVENT, track);
      script.remove();
    };
  }, []);

  return null;
}
