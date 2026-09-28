import { Navigate, useParams } from "react-router";
import { watchPath } from "../lib/api.js";

export default function WatchPage() {
  const { mediaType, id, season, episode } = useParams();
  return (
    <Navigate replace to={watchPath({ mediaType, id }, season, episode)} />
  );
}
