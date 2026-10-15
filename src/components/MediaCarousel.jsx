import { CardSkeleton, MediaCard } from "./MediaCard.jsx";

export default function MediaCarousel({
  items,
  loading = false,
  emptyText = "No titles yet.",
  label = "Titles",
  id,
}) {
  if (!loading && !items.length)
    return <p className="py-8 text-sm text-slate-400">{emptyText}</p>;
  return (
    <div
      id={id}
      role="group"
      aria-label={label}
      aria-roledescription="carousel"
      tabIndex={0}
      className="grid min-w-0 snap-x snap-mandatory auto-cols-[calc((100%-1rem)/3)] grid-flow-col gap-2 overflow-x-auto overscroll-x-contain py-2 focus-visible:outline-sky-400 sm:auto-cols-[calc((100%-2.25rem)/4)] sm:gap-3 lg:auto-cols-[calc((100%-5rem)/6)] lg:gap-4"
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
          <div key={`ghost-${index}`} className="min-w-0 snap-start">
            <CardSkeleton detailed />
          </div>
        ))}
    </div>
  );
}
