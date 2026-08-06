import { groupStoreEvents, type GroupStoreEventsOptions } from "./event-list-groups";
import { getEventFlyer, type FlyerOrientation } from "./flyer-orientation";
import type { DisplayGalleryFlyer, DisplayGalleryMediaType, StoreEvent } from "./types";

export type FlyerDisplaySource = "event" | "gallery";

export type StoreFlyerDisplayItem = {
  id: string;
  source: FlyerDisplaySource;
  eventId?: string;
  title: string;
  imageUrl: string;
  mediaType?: DisplayGalleryMediaType;
  scheduleLabel: string;
  updatedAt: string;
  orientation: FlyerOrientation;
};

/** Event flyers + manual gallery items for in-store digital signage. */
export function listStoreFlyersForDisplay(
  events: StoreEvent[],
  options?: GroupStoreEventsOptions & {
    orientation?: FlyerOrientation;
    gallery?: DisplayGalleryFlyer[];
  },
): StoreFlyerDisplayItem[] {
  const orientation = options?.orientation ?? "portrait";
  const groups = groupStoreEvents(events, options);

  const fromEvents = groups
    .filter((g) => getEventFlyer(g.representativeEvent, orientation)?.imageUrl)
    .map((g) => {
      const flyer = getEventFlyer(g.representativeEvent, orientation)!;
      const eventId = g.representativeEvent.id;
      return {
        id: eventId,
        source: "event" as const,
        eventId,
        title: g.title,
        imageUrl: flyer.imageUrl,
        mediaType: "image" as const,
        scheduleLabel: g.scheduleLabel,
        updatedAt: flyer.updatedAt,
        orientation,
      };
    });

  const fromGallery = (options?.gallery ?? [])
    .filter((flyer) => flyer.orientation === orientation)
    .map((flyer) => ({
      id: flyer.id,
      source: "gallery" as const,
      title: flyer.title,
      imageUrl: flyer.imageUrl,
      mediaType: (flyer.mediaType ?? "image") as DisplayGalleryMediaType,
      scheduleLabel: flyer.caption?.trim() || "Custom media",
      updatedAt: flyer.updatedAt,
      orientation,
    }));

  return [...fromEvents, ...fromGallery].sort(
    (a, b) =>
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );
}
