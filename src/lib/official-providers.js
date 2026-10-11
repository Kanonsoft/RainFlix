const OFFER_TYPES = [
  ["flatrate", "Subscription"],
  ["free", "Free"],
  ["ads", "With ads"],
  ["rent", "Rent"],
  ["buy", "Buy"],
];

let countryRequest;

function localeCountry() {
  for (const language of navigator.languages || [navigator.language]) {
    try {
      const region = new Intl.Locale(language).region;
      if (/^[A-Z]{2}$/.test(region || "")) return region;
    } catch {
      /* Ignore unsupported language tags. */
    }
  }
  return null;
}

export function detectViewingCountry() {
  if (!countryRequest) {
    countryRequest = (async () => {
      const controller = new AbortController();
      const timer = window.setTimeout(() => controller.abort(), 3000);
      try {
        const response = await fetch("https://api.country.is/", {
          signal: controller.signal,
          cache: "no-store",
          credentials: "omit",
          referrerPolicy: "no-referrer",
        });
        if (!response.ok) throw new Error("Country lookup failed.");
        const { country } = await response.json();
        if (/^[A-Z]{2}$/.test(country || "")) return country;
      } catch {
        /* Privacy blockers and offline devices can use their explicit locale region. */
      } finally {
        window.clearTimeout(timer);
      }
      return localeCountry();
    })();
  }
  return countryRequest;
}

export function officialProviders(results, region) {
  const availability = results?.[region];
  let link;
  try {
    const url = new URL(availability?.link);
    if (
      url.protocol === "https:" &&
      ["www.themoviedb.org", "themoviedb.org"].includes(url.hostname)
    )
      link = url.href;
  } catch {
    // An availability record without a trusted destination is not actionable.
  }
  if (!link) return [];
  const providers = new Map();
  for (const [type, label] of OFFER_TYPES) {
    const offers = availability[type];
    if (!Array.isArray(offers)) continue;
    for (const offer of offers) {
      if (!Number.isInteger(offer?.provider_id) || !offer.provider_name)
        continue;
      const entry = providers.get(offer.provider_id) || {
        id: offer.provider_id,
        name: String(offer.provider_name),
        logo: /^\/[\w.-]+$/.test(offer.logo_path || "")
          ? `https://image.tmdb.org/t/p/w92${offer.logo_path}`
          : "",
        priority: Number(offer.display_priority) || 0,
        offers: [],
        link,
      };
      if (!entry.offers.includes(label)) entry.offers.push(label);
      providers.set(entry.id, entry);
    }
  }
  return [...providers.values()].sort(
    (a, b) => a.priority - b.priority || a.name.localeCompare(b.name),
  );
}

export function countryName(region) {
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(region);
  } catch {
    return region;
  }
}
