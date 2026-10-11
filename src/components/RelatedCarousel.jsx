import { MediaCard } from "./MediaCard.jsx";

export default function RelatedCarousel({ items }) {
  return (
    <section
      className="mt-12 min-w-0"
      aria-labelledby="similarTitle"
      aria-roledescription="carousel"
    >
      <h2 id="similarTitle" className="mb-5 text-xl font-bold">
        More like this
      </h2>
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
      </div>
    </section>
  );
}
