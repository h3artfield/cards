import type { CalendarSettings, DisplayGalleryFlyer } from "./types";
import type { FlyerOrientation } from "./flyer-orientation";

export function listGalleryFlyers(
  calendar: CalendarSettings | undefined,
  orientation: FlyerOrientation,
): DisplayGalleryFlyer[] {
  return (calendar?.displayGallery ?? []).filter(
    (flyer) => flyer.orientation === orientation,
  );
}

export function addGalleryFlyer(
  calendar: CalendarSettings,
  flyer: DisplayGalleryFlyer,
): CalendarSettings {
  return {
    ...calendar,
    displayGallery: [...(calendar.displayGallery ?? []), flyer],
  };
}

export function removeGalleryFlyer(
  calendar: CalendarSettings,
  id: string,
): CalendarSettings {
  return {
    ...calendar,
    displayGallery: (calendar.displayGallery ?? []).filter(
      (flyer) => flyer.id !== id,
    ),
  };
}

export function findGalleryFlyer(
  calendar: CalendarSettings | undefined,
  id: string,
): DisplayGalleryFlyer | undefined {
  return (calendar?.displayGallery ?? []).find((flyer) => flyer.id === id);
}
