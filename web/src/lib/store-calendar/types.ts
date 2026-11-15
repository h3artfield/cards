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
  /** Entry cost in dollars; 0 = free, omit for no price shown. */
  cost?: number | null;
  /** Commander bracket this event seats (1–5). Omit for open-bracket nights. */
  requiredBracket?: number | null;
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

/**
 * What a player said they are bringing, recorded at the moment they registered.
 *
 * A snapshot rather than a live read of the deck. The organiser needs to know
 * what was registered even if the player rebuilds the deck afterwards, and
 * snapshotting means the store reads this row instead of reading somebody's
 * private decklist — there is no "the shop can see my deck" permission here,
 * and this feature does not need one.
 *
 * The commander and bracket are resolved server-side from the player's own
 * deck. They are never taken from the request: a table where anyone can type
 * "bracket 1" next to a cEDH list is worse than no brackets at all.
 */
export interface StoreEventSignupDeck {
  /** The deck this describes, so later edits can be detected. */
  deckId: string;
  deckName: string;
  commanderName: string;
  /** The bracket the deck measured when it was registered. */
  bracket: number;
  /** Deck revision at registration; a change means the snapshot has aged. */
  atRevision: number;
  registeredAt: string;
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
  /** Present only for signed-in players who chose a deck. */
  deck?: StoreEventSignupDeck;
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
