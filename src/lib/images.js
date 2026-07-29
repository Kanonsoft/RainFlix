const TMDB_IMAGE_PATTERN =
  /^(https:\/\/image\.tmdb\.org\/t\/p\/)(?:w\d+|original)(\/.+)$/;

function tmdbVariant(url, size) {
  const match = String(url || "").match(TMDB_IMAGE_PATTERN);
  return match ? `${match[1]}${size}${match[2]}` : "";
}

function imageSrcSet(url, sizes) {
  if (!String(url || "").match(TMDB_IMAGE_PATTERN)) {
    return undefined;
  }

  return sizes
    .map(({ size, width }) => `${tmdbVariant(url, size)} ${width}w`)
    .join(", ");
}

export function posterImageProps(url, sizes = "(min-width: 768px) 16vw, 48vw") {
  return {
    sizes,
    srcSet: imageSrcSet(url, [
      { size: "w185", width: 185 },
      { size: "w342", width: 342 },
      { size: "w500", width: 500 },
      { size: "w780", width: 780 },
    ]),
  };
}

export function backdropImageProps(url, sizes = "100vw") {
  return {
    sizes,
    srcSet: imageSrcSet(url, [
      { size: "w780", width: 780 },
      { size: "w1280", width: 1280 },
      { size: "original", width: 1920 },
    ]),
  };
}
