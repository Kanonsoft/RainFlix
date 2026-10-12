import { CardSkeleton, MediaCard } from "./MediaCard.jsx";
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
      <div
        id="similarCarousel"
        className="grid snap-x snap-mandatory auto-cols-[calc((100%-1rem)/3)] grid-flow-col gap-2 overflow-x-auto overscroll-x-contain py-2 sm:auto-cols-[calc((100%-2.25rem)/4)] sm:gap-3 lg:auto-cols-[calc((100%-5rem)/6)] lg:gap-4"
      >
        {items.map((item) => (
          <div
            key={`${item.mediaType}:${item.id}`}
            className="min-w-0 snap-start"
          >
            <MediaCard item={item} />
          </div>
        ))}
        {loading &&
          Array.from({ length: 12 }, (_, index) => (
            <div key={`similar-ghost-${index}`} className="min-w-0 snap-start">
              <CardSkeleton detailed />
            </div>
          ))}
      </div>
    </section>
  );
}
