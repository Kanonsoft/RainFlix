export function trackEvent(name, data) {
  if (!name || typeof window.umami?.track !== "function") {
    return;
  }

  try {
    window.umami.track(name, data);
  } catch {
    // Analytics must never interrupt the application.
  }
}
