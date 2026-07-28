import { useEffect, useState } from "react";

export default function TitleArtwork({
  fallbackClassName,
  imageClassName,
  logo,
  title,
}) {
  const [failed, setFailed] = useState(false);

  useEffect(() => setFailed(false), [logo]);

  if (logo && !failed) {
    return (
      <img
        className={imageClassName}
        src={logo}
        alt={title}
        decoding="async"
        draggable="false"
        onError={() => setFailed(true)}
      />
    );
  }

  return <span className={fallbackClassName}>{title}</span>;
}
