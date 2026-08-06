import type { StoreEvent, StoreEventFlyer, StoreEventFlyers } from "./types";

export type FlyerOrientation = "portrait" | "landscape";

/** OpenAI image size — 9:16 portrait TV, 16:9 landscape TV. */
export function flyerImageSize(orientation: FlyerOrientation): string {
  return orientation === "landscape" ? "1536x1024" : "1024x1536";
}

export function parseFlyerOrientation(raw: unknown): FlyerOrientation {
  const value = String(raw ?? "portrait").trim().toLowerCase();
  return value === "landscape" ? "landscape" : "portrait";
}

export function getEventFlyer(
  event: StoreEvent,
  orientation: FlyerOrientation,
): StoreEventFlyer | undefined {
  if (orientation === "landscape") {
    return event.flyers?.landscape;
  }
  return event.flyers?.portrait ?? event.flyer;
}

export function withEventFlyer(
  event: StoreEvent,
  orientation: FlyerOrientation,
  flyer: StoreEventFlyer,
): StoreEvent {
  const flyers: StoreEventFlyers = { ...event.flyers };
  if (orientation === "portrait") {
    flyers.portrait = flyer;
    return { ...event, flyers, flyer };
  }
  flyers.landscape = flyer;
  return { ...event, flyers };
}

export function withoutEventFlyer(
  event: StoreEvent,
  orientation: FlyerOrientation,
): StoreEvent {
  const flyers: StoreEventFlyers = { ...event.flyers };
  if (orientation === "portrait") {
    delete flyers.portrait;
  } else {
    delete flyers.landscape;
  }

  const next: StoreEvent = {
    ...event,
    updatedAt: new Date().toISOString(),
  };

  if (flyers.portrait || flyers.landscape) {
    next.flyers = flyers;
  } else {
    delete next.flyers;
  }

  if (orientation === "portrait") {
    delete next.flyer;
  }

  return next;
}
