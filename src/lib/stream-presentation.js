export function streamPresentation(label = "") {
  const text = String(label).trim();
  const split = text.indexOf(" - ");
  const heading = split < 0 ? text : text.slice(0, split);
  const details = split < 0 ? "" : text.slice(split + 3).trim();
  const quality = text.match(/\b(2160|1080|720|480)p?\b/i)?.[1];
  const codec = text.match(
    /\b(HEVC|H[ .]?265|x265|H[ .]?264|x264|AV1)\b/i,
  )?.[0];
  const size = text.match(/\b\d+(?:\.\d+)?\s?(?:GB|MB)\b/i)?.[0];
  return {
    heading: heading || "Stream",
    details,
    badges: [quality && `${quality}p`, codec?.toUpperCase(), size].filter(
      Boolean,
    ),
  };
}
