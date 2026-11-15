export const STORE_SLUG = process.env.UX_STORE_SLUG ?? "the-game-lodge";
export const EXPECTED_EMAIL = process.env.UX_CUSTOMER_EMAIL ?? "h3artfield@gmail.com";
export const STORE_PATH = `/s/${STORE_SLUG}`;

export const PATHS = {
  dashboard: STORE_PATH,
  decks: `${STORE_PATH}/decks`,
  decksNew: `${STORE_PATH}/decks/new`,
  shop: `${STORE_PATH}/inventory`,
  professor: `${STORE_PATH}/inventory/professor`,
  howCos: `${STORE_PATH}/inventory/professor/how-cos-works`,
  events: `${STORE_PATH}/calendar`,
  collection: `${STORE_PATH}/collection`,
  /** Explicitly never navigated by this suite. */
  scan: `${STORE_PATH}/scan`,
  collectionScan: `${STORE_PATH}/collection/scan`,
} as const;
