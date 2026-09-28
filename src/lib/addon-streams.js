export async function addonFetch(
  url,
  signal,
  { label, timeoutMs = 25000, asText = false },
) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  let timedOut = false;
  const timeout = window.setTimeout(
    () => {
      timedOut = true;
      controller.abort();
    },
    Number(timeoutMs) || 25000,
  );

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      cache: "no-store",
      credentials: "omit",
    });
    if (response.status === 429) {
      throw new Error(`${label} is busy. Please try again shortly.`);
    }
    if (!response.ok) {
      throw new Error(
        `${label} request failed (${response.status}). Try again.`,
      );
    }
    return await (asText ? response.text() : response.json());
  } catch (error) {
    if (signal?.aborted) throw error;
    if (timedOut) {
      throw new Error(`${label} took too long to respond. Try again.`, {
        cause: error,
      });
    }
    if (error instanceof TypeError) {
      throw new Error(
        `Cannot reach ${label}. Check your connection or try again later.`,
        { cause: error },
      );
    }
    if (error instanceof SyntaxError) {
      throw new Error(
        `${label} returned an unreadable response. Try again later.`,
        { cause: error },
      );
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
    signal?.removeEventListener("abort", abort);
  }
}

export function httpUrl(value) {
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}

export function normalizeSubtitles(subtitles = []) {
  const seen = new Set();
  return (Array.isArray(subtitles) ? subtitles : []).flatMap((subtitle) => {
    const url = httpUrl(subtitle?.url);
    if (!url || seen.has(url)) return [];
    seen.add(url);
    const language = String(subtitle.lang || "und");
    let name = language;
    try {
      name = new Intl.DisplayNames(["en"], { type: "language" }).of(language);
    } catch {
      // Preserve provider language labels that are not BCP 47 codes.
    }
    return [
      {
        url,
        language,
        label: [name, subtitle.label].filter(Boolean).join(" - "),
      },
    ];
  });
}

export function streamLabel(stream, index) {
  return [
    stream.name || `Stream ${index + 1}`,
    stream.description || stream.title,
  ]
    .filter(Boolean)
    .join(" - ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeHttpStream(stream, index, providerLabel) {
  const url = httpUrl(stream?.url);
  if (!url) return null;
  const requiresHeaders =
    Object.keys(stream.behaviorHints?.proxyHeaders?.request || {}).length > 0;
  return {
    id: String(index),
    url,
    label: streamLabel(stream, index),
    blockedReason: requiresHeaders
      ? `This stream requires a media proxy. Choose another stream or configure a proxy in ${providerLabel}.`
      : window.location.protocol === "https:" &&
          new URL(url).protocol === "http:"
        ? "This stream uses HTTP and cannot play on an HTTPS page. Choose another stream."
        : "",
    subtitles: normalizeSubtitles(stream.subtitles),
  };
}

export function addonStreamList(data, label) {
  if (data?.retryAfter)
    throw new Error(`${label} is busy. Please try again shortly.`);
  if (!Array.isArray(data?.streams))
    throw new Error(`${label} returned an invalid stream list.`);
  return data.streams;
}
