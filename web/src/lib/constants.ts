import type { ConditionEstimate, StoreSettings } from "./types";

export const DEFAULT_CONDITION_MULTIPLIERS: Record<ConditionEstimate, number> = {
  NM: 1.0,
  LP: 0.8,
  MP: 0.6,
  HP: 0.35,
  DMG: 0.15,
};

export const CONDITION_LABELS: Record<ConditionEstimate, string> = {
  NM: "Near Mint",
  LP: "Lightly Played",
  MP: "Moderately Played",
  HP: "Heavily Played",
  DMG: "Damaged",
};

export const DEFAULT_STORE_SETTINGS: Omit<StoreSettings, "id"> = {
  storeName: "Card Shop Buyback",
  storeSlug: "card-shop-buyback",
  ownerEmail: "owner@example.com",
  defaultCashPercent: 0.5,
  defaultTradePercent: 0.65,
  slabCashPercent: 0.55,
  slabTradePercent: 0.7,
  manualReviewThreshold: 50,
  minimumOffer: 0.25,
  conditionMultipliers: DEFAULT_CONDITION_MULTIPLIERS,
  emailNotificationsEnabled: true,
  smsNotificationsEnabled: false,
  customerGuestModeEnabled: false,
  customerEmailVerificationMode: "required_before_submit",
};

export const ORDER_STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  scanning: "Scanning",
  submitted: "Submitted",
  processing: "Processing",
  under_review: "Under Review",
  offer_ready: "Offer Ready",
  accepted: "Accepted",
  declined: "Declined",
  paid: "Paid",
  cancelled: "Cancelled",
};

export const CARD_STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  processed: "Identified",
  manual_review: "Under review",
  do_not_buy: "Not eligible",
  approved: "Approved",
};

export const CONSENT_TEXT =
  "By submitting, you agree that the store may review your card images and contact you about this buyback order. Offers are estimates and subject to in-person verification.";

export const PRIVACY_MESSAGE =
  "Your card images and contact information are stored securely and used only for this buyback order. We never share your data with third parties.";
