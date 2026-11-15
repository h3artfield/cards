import type { TokenCardV1 } from "./design-v1";

export const TOKEN_DESIGNS_COLLECTION = "tokenDesigns";
export const TOKEN_GENERATIONS_COLLECTION = "tokenGenerations";
export const TOKEN_VERSIONS_COLLECTION = "tokenVersions";
export const TOKEN_SNAPSHOTS_COLLECTION = "tokenPrintSnapshots";
export const TOKEN_ORDERS_COLLECTION = "tokenPrintOrders";
export const TOKEN_USAGE_COLLECTION = "tokenCreatorUsage";
export const TOKEN_GALLERY_COLLECTION = "tokenGallery";

export type TokenGalleryStatusV1 = "pending" | "approved" | "hidden";

/**
 * A design a customer shared with the store's gallery. Others can copy the
 * look, words and art prompt into a new design of their own; the artwork
 * itself stays the author's (only the preview picture is shared). Staff
 * approve each entry before other customers can see it.
 */
export type TokenGalleryEntryV1 = {
  entryId: string;
  storeId: string;
  customerId: string;
  /** The author's first name, as shown under the entry. */
  authorName: string;
  title: string;
  /** With the author's uploads removed, so copies cannot point at their files. */
  card: TokenCardV1;
  prompt: string;
  styleId: string | null;
  blendStyleId: string | null;
  blendWeight: number;
  /** The card front as it looked when shared, art included. */
  previewPath: string;
  status: TokenGalleryStatusV1;
  copies: number;
  createdAt: string;
  reviewedAt: string | null;
  reviewedBy: string | null;
};

export type TokenDesignV1 = {
  designId: string;
  customerId: string;
  storeId: string;
  name: string;
  card: TokenCardV1;
  prompt: string;
  styleId: string | null;
  /** A second style mixed into `styleId`; `blendWeight` is its share, 0.2 to 0.8. */
  blendStyleId?: string | null;
  blendWeight?: number;
  /** "mixed" gives each of the four images its own style from `batchStyleIds`. */
  styleMode?: TokenStyleModeV1;
  batchStyleIds?: Array<string | null> | null;
  /** Where the design came from, e.g. a deck's token. */
  source: { deckId?: string; tokenName?: string } | null;
  reference?: TokenReferenceV1 | null;
  latestGenerationId: string | null;
  generationIds: string[];
  createdAt: string;
  updatedAt: string;
};

export type TokenStyleModeV1 = "single" | "mixed";

/** A picture the customer uploaded for the AI to work from, and what they want done with it. */
export type TokenReferenceV1 = { path: string; use: string };

export type TokenSlotStatusV1 = "queued" | "running" | "done" | "failed";

export type TokenSlotV1 = {
  slotIndex: number;
  status: TokenSlotStatusV1;
  /** The version shown in this slot now. */
  versionId: string | null;
  /** Every version this slot has produced, oldest first; regeneration never deletes. */
  history: string[];
  error: string | null;
  attempts: number;
  startedAt: string | null;
  finishedAt: string | null;
  styleId: string | null;
  blendStyleId?: string | null;
  blendWeight?: number;
};

export type TokenGenerationStatusV1 = "running" | "done" | "partial" | "failed";

export type TokenGenerationV1 = {
  generationId: string;
  designId: string;
  customerId: string;
  storeId: string;
  prompt: string;
  styleId: string | null;
  blendStyleId?: string | null;
  blendWeight?: number;
  styleMode?: TokenStyleModeV1;
  styleRegistryVersion: string;
  provider: "openai";
  model: string;
  quality: string;
  size: string;
  status: TokenGenerationStatusV1;
  slots: TokenSlotV1[];
  /** The card as it was when generation started; each version starts from it. */
  card: TokenCardV1;
  reference?: TokenReferenceV1 | null;
  imageCount: number;
  estimatedCostCents: number;
  createdAt: string;
  updatedAt: string;
};

export type TokenVersionV1 = {
  versionId: string;
  generationId: string;
  designId: string;
  customerId: string;
  storeId: string;
  slotIndex: number;
  artworkPath: string;
  artworkWidth: number;
  artworkHeight: number;
  /** Per-version edits; null means it follows the design's card. */
  card: TokenCardV1 | null;
  prompt: string;
  revisedPrompt: string | null;
  styleId: string | null;
  blendStyleId?: string | null;
  blendWeight?: number;
  model: string;
  status: "active" | "superseded";
  createdAt: string;
};

/** Frozen when a card goes in the cart, so later edits cannot change an order. */
export type TokenPrintSnapshotV1 = {
  snapshotId: string;
  versionId: string;
  designId: string;
  customerId: string;
  storeId: string;
  card: TokenCardV1;
  artworkPath: string;
  frontPath: string;
  backPath: string;
  frontWidth: number;
  frontHeight: number;
  dpi: number;
  bleedMm: number;
  styleName: string | null;
  createdAt: string;
};

export type TokenPaymentStateV1 = "awaiting_payment" | "paid" | "abandoned" | "refunded" | "cancelled";
export type TokenProductionStateV1 = "not_released" | "paid" | "ready" | "printing" | "printed" | "fulfilled" | "cancelled";

export type TokenPrintOrderLineV1 = {
  snapshotId: string;
  versionId: string;
  name: string;
  styleName: string | null;
  quantity: number;
  unitPriceCents: number;
  frontPath: string;
  backPath: string;
};

export type TokenPrintOrderV1 = {
  orderId: string;
  customerId: string;
  customerName: string;
  customerEmail: string;
  storeId: string;
  lines: TokenPrintOrderLineV1[];
  cardCount: number;
  subtotalCents: number;
  draftOrderId: string;
  draftOrderName: string;
  invoiceUrl: string | null;
  shopifyOrderId: string | null;
  shopifyOrderName: string | null;
  paymentState: TokenPaymentStateV1;
  productionState: TokenProductionStateV1;
  /** Webhook ids already applied, so retries change nothing. */
  processedEvents: string[];
  statusHistory: Array<{ at: string; state: string; by: string }>;
  shippingSummary: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
  paidAt: string | null;
};
