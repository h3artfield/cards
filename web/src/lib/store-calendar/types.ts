/** Built-in category ids shipped with every store calendar. */
export type BuiltinStoreEventCategory =
  | "pokemon"
  | "magic"
  | "commander"
  | "standard"
  | "prerelease"
  | "set_release"
  | "lorcana"
  | "warhammer"
  | "riftbound"
  | "other";

/** Event category slug — built-in or store-defined custom id. */
export type StoreEventCategory = string;

export interface CalendarCustomCategory {
  id: string;
  label: string;
  color: string;
}

/** Manually uploaded media for in-store TV rotation (not tied to an event). */
export type DisplayGalleryMediaType = "image" | "video";

export interface DisplayGalleryFlyer {
  id: string;
  title: string;
  imageUrl: string;
  mediaType?: DisplayGalleryMediaType;
  caption?: string;
  orientation: "portrait" | "landscape";
  createdAt: string;
  updatedAt: string;
}

export interface StoreEventFlyer {
  imageUrl: string;
  prompt: string;
  eventInfo: string;
  revisedPrompt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface StoreEventFlyers {
  portrait?: StoreEventFlyer;
  landscape?: StoreEventFlyer;
}

export interface StoreEvent {
  id: string;
  storeId: string;
  title: string;
  description?: string;
  category: StoreEventCategory;
  /** Optional hex override; otherwise category default is used. */
  color?: string;
  startAt: string;
  endAt: string;
  allDay?: boolean;
  /** Max attendees; omit or null for unlimited. */
  capacity?: number | null;
  /** External signup URL (Shopify form, Eventbrite, etc.) */
  signupUrl?: string;
  published: boolean;
  createdAt: string;
  updatedAt: string;
  /** Links recurring instances created together. */
  seriesId?: string;
  /** @deprecated Use flyers.portrait — kept for older records. */
  flyer?: StoreEventFlyer;
  /** Portrait and landscape flyers for in-store TV displays. */
  flyers?: StoreEventFlyers;
}

export interface StoreEventSignup {
  id: string;
  storeId: string;
  eventId: string;
  /** Linked buyback customer account when available. */
  customerId?: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  createdAt: string;
}

export interface StoreEventPublic extends StoreEvent {
  signupCount: number;
  spotsRemaining: number | null;
}

export interface CalendarSettings {
  /** Master switch — calendar visible when published. */
  enabled: boolean;
  published: boolean;
  timezone: string;
  embedEnabled: boolean;
  headline?: string;
  /** Store-specific categories beyond the built-in defaults. */
  customCategories?: CalendarCustomCategory[];
  /** Manually uploaded display flyers (portrait and landscape). */
  displayGallery?: DisplayGalleryFlyer[];
}

export const DEFAULT_CALENDAR_SETTINGS: CalendarSettings = {
  enabled: true,
  published: false,
  timezone: "America/Chicago",
  embedEnabled: true,
  headline: "Click on an Event to Sign Up!",
  customCategories: [],
};
