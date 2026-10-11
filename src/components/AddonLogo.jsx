import { useCachedAddonLogo } from "../lib/addon-logos.js";
import rainflixLogo from "../../assets/rainflix-r.png";

export default function AddonLogo({
  url,
  className = "h-10 w-10 shrink-0 rounded-lg object-contain",
}) {
  const image = useCachedAddonLogo(url);
  return (
    <img
      src={image || rainflixLogo}
      alt=""
      draggable={false}
      referrerPolicy="no-referrer"
      className={className}
      onError={(event) => {
        event.currentTarget.onerror = null;
        event.currentTarget.src = rainflixLogo;
      }}
    />
  );
}
