import MediaCarousel from "./MediaCarousel.jsx";
import { Link } from "react-router";

export default function RelatedCarousel({ items, morePath, loading = false }) {
  return (
    <section
      className="mt-12 min-w-0"
      aria-labelledby="similarTitle"
      aria-roledescription="carousel"
      aria-busy={loading}
    >
      <div className="mb-5 flex items-center justify-between gap-4">
        <h2 id="similarTitle" className="text-xl font-bold">
          More like this
        </h2>
        {morePath && (
          <Link
            to={morePath}
            aria-label="More recommendations"
            className="inline-flex min-h-11 items-center text-sm font-bold text-sky-300 hover:text-sky-100 focus-visible:outline-sky-400"
          >
            More
          </Link>
        )}
      </div>
      <MediaCarousel
        id="similarCarousel"
        label="Similar titles"
        items={items}
        loading={loading}
      />
    </section>
  );
}
