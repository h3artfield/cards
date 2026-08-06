import type { CategoryDetectiveGuide } from "../types";

/** Vision rules for Riftbound variant identification. */
export const RIFTBOUND_IMAGE_EVIDENCE_RULES = `Riftbound variant identification (collector number is critical):
- Read the full collector number including suffix and asterisk — do not strip "a" or "*".
- Alternate art: collector number ends with "a" (e.g. 30a).
- Overnumbered: collector number above main set total (Origins OGN main set = 298, so #299+ is overnumbered).
- Official Signature Overnumbered: collector number contains "*" OR catalog/listing says Signature with asterisk marker.
- A visible pen signature WITHOUT official asterisk marker → riftbound_signature_type "unknown" (may be aftermarket).
- Proving Grounds (OGS): cards do NOT have foil versions — record finish as "normal" for OGS.
- Origins (OGN): Rares, Epics, and Overnumbered are foil by default when catalog confirms.
- Ultimate rarity cards always require staff review — record riftbound_ultimate when visible.
- Extract: riftbound_set_code, riftbound_collector_number, riftbound_collector_suffix, riftbound_signature_asterisk, riftbound_signature_visible, riftbound_signature_type, riftbound_overnumbered, riftbound_alt_art, riftbound_finish, riftbound_ultimate.
- If base vs alternate art vs overnumbered vs signature cannot be distinguished, use identificationMode "continue_with_variant_uncertainty" or "candidate_list_only".`;

export const RIFTBOUND_KNOWLEDGE_VERSION = "2026-07-03.v1";

export type RiftboundSetCode =
  | "OGN"
  | "OGS"
  | "SPF"
  | "UNL"
  | "UNKNOWN";

export type RiftboundFinish =
  | "normal"
  | "foil"
  | "foil_default"
  | "textured_foil"
  | "signature_foil"
  | "unknown";

export type RiftboundRarity =
  | "common"
  | "uncommon"
  | "rare"
  | "epic"
  | "ultimate"
  | "alternate_art"
  | "overnumbered"
  | "signature_overnumbered"
  | "token"
  | "rune"
  | "unknown";

export type RiftboundSignatureType =
  | "official_signature_overnumber"
  | "aftermarket_autograph"
  | "artist_signed_aftermarket"
  | "none"
  | "unknown";

export type RiftboundCardType =
  | "legend"
  | "champion"
  | "unit"
  | "spell"
  | "signature_spell"
  | "gear"
  | "battlefield"
  | "rune"
  | "token"
  | "unknown";

export type RiftboundDomain =
  | "body"
  | "mind"
  | "fury"
  | "calm"
  | "order"
  | "chaos"
  | "unknown";

export type RiftboundCollectorNumberParsed = {
  raw: string;
  number?: number;
  setTotal?: number;
  suffix?: string;
  hasAltArtSuffix: boolean;
  hasSignatureAsterisk: boolean;
  isOvernumbered: boolean;
};

export type RiftboundIdentityFields = {
  name?: string;
  subtitle?: string;
  setCode?: RiftboundSetCode | string;
  setName?: string;
  collectorNumber?: string;
  parsedCollectorNumber?: RiftboundCollectorNumberParsed;
  rarity?: RiftboundRarity;
  finish?: RiftboundFinish;
  cardType?: RiftboundCardType;
  domain?: RiftboundDomain;
  signatureType?: RiftboundSignatureType;
  language?: string;
  productSource?: string;
  artist?: string;
};

export const RIFTBOUND_SET_TOTALS: Record<string, number> = {
  OGN: 298,
};

export const RIFTBOUND_KNOWN_SET_CODES = [
  {
    code: "OGN" as const,
    name: "Origins",
    notes: [
      "Main set has 298 cards.",
      "Overnumbered cards are #299 and above.",
      "All Origins cards have foil versions in booster packs.",
      "Rares, Epics, and Overnumbered cards are foil by default.",
    ],
  },
  {
    code: "OGS" as const,
    name: "Proving Grounds",
    notes: [
      "Proving Grounds cards do not have foil versions.",
      "Do not create foil suspects for OGS unless catalog data later contradicts this.",
    ],
  },
  {
    code: "SPF" as const,
    name: "Spiritforged",
    notes: [
      "Verify exact set code from catalog source.",
      "Spiritforged includes Overnumbered cards and Signature variants.",
    ],
  },
  {
    code: "UNL" as const,
    name: "Unleashed",
    notes: [
      "Verify exact set code from catalog source.",
      "Unleashed introduces Ultimate rarity.",
    ],
  },
];

export const RIFTBOUND_DETECTIVE_GUIDE: CategoryDetectiveGuide = {
  category: "riftbound",
  importantRegions: [
    "card name/title line",
    "subtitle/champion title line",
    "collector number area",
    "set code / set icon area",
    "rarity marker",
    "foil/texture surface",
    "alternate-art collector suffix",
    "overnumbered collector number",
    "signature area",
    "artist signature or foil signature",
    "domain/color symbols",
    "card type line",
    "language text",
    "grading slab label if present",
  ],
  keyFields: [
    "name",
    "subtitle",
    "setCode",
    "setName",
    "collectorNumber",
    "rarity",
    "finish",
    "altArt",
    "overnumbered",
    "signatureType",
    "language",
    "cardType",
    "domain",
    "gradeContext",
  ],
  identificationFormula:
    "Card name + set code + collector number + exact variant (alt-art suffix / overnumbered / signature) + finish when relevant + condition (e.g. Ahri - Nine-Tailed Fox OGN #303* [Signature Overnumbered] — Near Mint). Never price from name alone.",
  catalogSources: [
    "Official Riftbound card gallery — https://playriftbound.com/en-us/card-gallery/ (preferred identity reference).",
    "TCGplayer product data when mapped.",
    "PriceCharting when mapped.",
    "Local normalized fixtures until official API is available.",
  ],
  marketResearchNotes: [
    "Same card name does not mean same market product — collector suffix, overnumbered status, and signature marker change value dramatically.",
    "Never mix base, alternate art, overnumbered, and Signature Overnumbered comps.",
    "Aftermarket autographs are not official Signature Overnumbered products.",
    "Ultimate rarity and Signature Overnumbered always warrant staff review before offer influence.",
  ],
  variantTraps: [
    "Base card and alternate art are different market products.",
    "Alternate art cards can be marked with an 'a' suffix in the collector number.",
    "Overnumbered cards have collector numbers above the main set total and must not be priced from base-card comps.",
    "Official Signature Overnumbered cards are distinct high-value market products.",
    "Official Signature Overnumbered cards should not be confused with aftermarket autographs.",
    "A visible signature can drastically change value and should trigger staff review unless the official signature identity is locked.",
    "Foil status matters, but some Riftbound rarities are foil by default.",
    "Proving Grounds OGS cards do not have foil versions.",
    "Rares, Epics, and Overnumbered cards are foil by default in Origins.",
    "Ultimate rarity should trigger high-value staff review.",
    "Tokens and runes should not be mixed with main-deck card comps.",
    "Language/region variants may price differently.",
    "Raw and graded cards must not share comps.",
  ],
  lockRequirements: [
    "card name",
    "set code or set identity",
    "collector number",
    "alternate-art suffix if relevant",
    "overnumbered status if relevant",
    "signature status if relevant",
    "finish when multiple finishes exist",
    "language when non-English variants are possible",
    "grade context if slabbed",
  ],
  staffTips: [
    "If collector number ends with 'a', treat as alternate art.",
    "If collector number is above the normal set total, treat as Overnumbered.",
    "If collector number has an asterisk or a foil artist signature is visible, treat as possible official Signature Overnumbered.",
    "If a signature is visible but the official signature marker is unclear, staff should inspect the collector number and signature area.",
    "Do not price official Signature cards from non-signature comps.",
    "Do not price Overnumbered cards from base-card comps.",
    "If foil treatment is unclear on a Common/Uncommon card, show both foil and normal suspects.",
    "If the card is OGS / Proving Grounds, do not create a foil suspect unless catalog data says otherwise.",
    "High-value Riftbound cards should require staff confirmation before any future offer influence.",
  ],
};

export function parseRiftboundCollectorNumber(
  raw: string,
  setCode?: string,
): RiftboundCollectorNumberParsed {
  const normalized = raw.trim();
  const hasSignatureAsterisk = normalized.includes("*");
  const cleaned = normalized.replace("*", "");
  const suffixMatch = cleaned.match(/[a-zA-Z]+$/);
  const suffix = suffixMatch?.[0];
  const numberMatch = cleaned.match(/(\d+)/);
  const number = numberMatch ? Number(numberMatch[1]) : undefined;
  const totalMatch = cleaned.match(/\/\s*(\d+)/);
  const setTotalFromRaw = totalMatch ? Number(totalMatch[1]) : undefined;
  const knownSetTotal = setCode ? RIFTBOUND_SET_TOTALS[setCode] : undefined;
  const setTotal = setTotalFromRaw ?? knownSetTotal;
  const hasAltArtSuffix = suffix?.toLowerCase() === "a";
  const isOvernumbered =
    typeof number === "number" &&
    typeof setTotal === "number" &&
    number > setTotal;

  return {
    raw: normalized,
    number,
    setTotal,
    suffix,
    hasAltArtSuffix,
    hasSignatureAsterisk,
    isOvernumbered,
  };
}

export function inferRiftboundSignatureType(input: {
  collectorNumber?: string;
  titleText?: string;
  visibleSignature?: boolean;
  catalogVariantTags?: string[];
}): RiftboundSignatureType {
  const title = input.titleText?.toLowerCase() ?? "";
  const tags = (input.catalogVariantTags ?? []).map((t) => t.toLowerCase());
  const collector = input.collectorNumber ?? "";

  if (
    tags.some((t) => t.includes("aftermarket") || t.includes("hand signed"))
  ) {
    return "aftermarket_autograph";
  }

  if (
    collector.includes("*") ||
    tags.some((t) => t.includes("signature")) ||
    title.includes("signature overnumber") ||
    title.includes("[signature]")
  ) {
    return "official_signature_overnumber";
  }

  if (
    input.visibleSignature &&
    (title.includes("signed") || title.includes("autograph"))
  ) {
    return "aftermarket_autograph";
  }

  if (input.visibleSignature && !collector.includes("*")) {
    return "unknown";
  }

  return "none";
}

export function normalizeRiftboundRarity(raw?: string): RiftboundRarity {
  if (!raw) return "unknown";
  const t = raw.toLowerCase().replace(/[\s-]+/g, "_");
  if (t.includes("signature") && t.includes("over")) return "signature_overnumbered";
  if (t.includes("overnumber")) return "overnumbered";
  if (t.includes("alternate") || t === "alt_art" || t === "aa") return "alternate_art";
  if (t.includes("ultimate")) return "ultimate";
  if (t.includes("epic")) return "epic";
  if (t.includes("rare")) return "rare";
  if (t.includes("uncommon")) return "uncommon";
  if (t.includes("common")) return "common";
  if (t.includes("token")) return "token";
  if (t.includes("rune")) return "rune";
  return "unknown";
}

export function getRiftboundFinishLockRule(input: {
  setCode?: string;
  rarity?: RiftboundRarity;
  hasFoilAndNonfoilSuspects?: boolean;
}): { finishRequiredToLock: boolean; reason: string } {
  if (input.setCode === "OGS") {
    return {
      finishRequiredToLock: false,
      reason: "Proving Grounds OGS cards do not have foil versions.",
    };
  }

  if (
    input.rarity === "rare" ||
    input.rarity === "epic" ||
    input.rarity === "overnumbered" ||
    input.rarity === "signature_overnumbered" ||
    input.rarity === "ultimate"
  ) {
    return {
      finishRequiredToLock: false,
      reason:
        "This rarity/variant is foil or premium by default when catalog confirms it.",
    };
  }

  if (input.hasFoilAndNonfoilSuspects) {
    return {
      finishRequiredToLock: true,
      reason: "Both foil and nonfoil suspects exist.",
    };
  }

  return {
    finishRequiredToLock: false,
    reason: "No competing finish suspects detected.",
  };
}

export const RIFTBOUND_VALUE_CRITICAL_FLAGS = [
  "official_signature_overnumber",
  "overnumbered",
  "alternate_art",
  "ultimate",
  "textured_foil",
  "signature_foil",
  "graded",
  "non_english",
  "aftermarket_autograph",
] as const;

export const RIFTBOUND_REQUIRED_SEARCH_TERMS = {
  base: ["name", "setCode", "collectorNumber"],
  alternateArt: ["name", "collectorNumberWithA", "alternate art"],
  overnumbered: ["name", "collectorNumber", "overnumbered"],
  signatureOvernumbered: ["name", "collectorNumber", "signature"],
  graded: ["gradingCompany", "grade", "name", "collectorNumber"],
};

export const RIFTBOUND_FORBIDDEN_SEARCH_TERMS = {
  raw: [
    "PSA",
    "CGC",
    "BGS",
    "SGC",
    "TAG",
    "graded",
    "slab",
    "lot",
    "bundle",
    "proxy",
    "custom",
    "digital",
    "sealed",
    "pack",
    "box",
  ],
  graded: [
    "raw",
    "lot",
    "bundle",
    "proxy",
    "custom",
    "digital",
    "sealed",
    "pack",
    "box",
  ],
  base: ["alternate art", "alt art", "overnumbered", "signature", "signed"],
  nonSignatureOvernumbered: ["signature", "signed", "[signature]"],
  signatureOvernumbered: ["non signature", "unsigned"],
};

export function buildRiftboundMarketProductName(
  identity: RiftboundIdentityFields,
): string {
  const parts: string[] = [];
  if (identity.name) parts.push(identity.name);
  if (identity.subtitle) parts.push(`- ${identity.subtitle}`);
  if (identity.setCode) parts.push(String(identity.setCode));
  if (identity.collectorNumber) parts.push(`#${identity.collectorNumber}`);

  if (identity.parsedCollectorNumber?.hasAltArtSuffix) {
    parts.push("[Alternate Art]");
  }
  if (identity.parsedCollectorNumber?.isOvernumbered) {
    parts.push("[Overnumbered]");
  }
  if (identity.signatureType === "official_signature_overnumber") {
    parts.push("[Signature]");
  }
  if (identity.rarity === "ultimate") {
    parts.push("[Ultimate]");
  }
  if (identity.finish && identity.finish !== "unknown") {
    parts.push(`[${identity.finish}]`);
  }

  return parts.join(" ").replace(/\s+/g, " ").trim();
}

export function getRiftboundLockBlockers(input: {
  identity: RiftboundIdentityFields;
  competingSuspects?: RiftboundIdentityFields[];
}): string[] {
  const blockers: string[] = [];
  const identity = input.identity;

  if (!identity.name) blockers.push("missing_name");
  if (!identity.setCode && !identity.setName) blockers.push("missing_set_identity");
  if (!identity.collectorNumber) blockers.push("missing_collector_number");

  const parsed = identity.parsedCollectorNumber;
  if (parsed?.hasAltArtSuffix && identity.rarity !== "alternate_art") {
    blockers.push("alt_art_suffix_without_variant_confirmation");
  }
  if (
    parsed?.isOvernumbered &&
    identity.rarity !== "overnumbered" &&
    identity.rarity !== "signature_overnumbered"
  ) {
    blockers.push("overnumbered_without_variant_confirmation");
  }
  if (
    identity.signatureType === "unknown" ||
    (parsed?.hasSignatureAsterisk &&
      identity.signatureType !== "official_signature_overnumber")
  ) {
    blockers.push("signature_status_uncertain");
  }
  if (identity.rarity === "ultimate") {
    blockers.push("ultimate_requires_staff_review");
  }
  if (identity.signatureType === "aftermarket_autograph") {
    blockers.push("aftermarket_autograph_requires_manual_review");
  }

  const hasCompetingSignature =
    input.competingSuspects?.some(
      (s) =>
        s.name === identity.name &&
        s.collectorNumber === identity.collectorNumber &&
        s.signatureType !== identity.signatureType,
    ) ?? false;

  if (hasCompetingSignature) {
    blockers.push("signature_variant_competes");
  }

  return blockers;
}

export function identityFieldsFromSuspect(
  suspect: import("../types").CardSuspect,
): RiftboundIdentityFields {
  const raw = suspect.rawCatalogData as { subtitle?: string; signatureType?: RiftboundSignatureType } | undefined;
  const collectorNumber = suspect.collectorNumber ?? suspect.cardNumber;
  const setCode = suspect.setCode;
  const parsed = collectorNumber
    ? parseRiftboundCollectorNumber(collectorNumber, setCode)
    : undefined;

  let signatureType = raw?.signatureType ?? inferRiftboundSignatureType({
    collectorNumber,
    catalogVariantTags: suspect.variantTags,
  });

  let rarity = normalizeRiftboundRarity(suspect.rarity);
  if (parsed?.hasAltArtSuffix && rarity === "unknown") rarity = "alternate_art";
  if (parsed?.isOvernumbered && parsed.hasSignatureAsterisk) {
    rarity = "signature_overnumbered";
    signatureType = "official_signature_overnumber";
  } else if (parsed?.isOvernumbered && rarity === "unknown") {
    rarity = "overnumbered";
  }

  return {
    name: suspect.canonicalName,
    subtitle: raw?.subtitle,
    setCode,
    setName: suspect.setName,
    collectorNumber,
    parsedCollectorNumber: parsed,
    rarity,
    finish: (suspect.finish as RiftboundFinish) ?? "unknown",
    signatureType,
    language: suspect.language,
  };
}

export function riftboundSetCodeHasFoilVariants(setCode?: string): boolean {
  return setCode !== "OGS";
}

export function riftboundDefaultFinishForRarity(
  setCode: string | undefined,
  rarity: RiftboundRarity,
): RiftboundFinish {
  if (setCode === "OGS") return "normal";
  if (
    rarity === "rare" ||
    rarity === "epic" ||
    rarity === "overnumbered" ||
    rarity === "signature_overnumbered" ||
    rarity === "ultimate"
  ) {
    return "foil_default";
  }
  return "unknown";
}

/** Source confidence: signature/ultimate/high-value variants need staff review. */
export function riftboundRequiresStaffReviewForPreview(input: {
  identity: RiftboundIdentityFields;
  marketValue?: number;
}): { required: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const id = input.identity;

  if (id.rarity === "ultimate") reasons.push("ultimate_rarity");
  if (id.signatureType === "official_signature_overnumber") {
    reasons.push("official_signature_overnumber");
  }
  if (id.signatureType === "aftermarket_autograph") {
    reasons.push("aftermarket_autograph");
  }
  if (id.signatureType === "unknown") reasons.push("signature_status_uncertain");
  if (id.parsedCollectorNumber?.isOvernumbered && !id.signatureType) {
    reasons.push("overnumbered_high_value");
  }
  if ((input.marketValue ?? 0) >= 100 && id.parsedCollectorNumber?.isOvernumbered) {
    reasons.push("high_value_overnumbered");
  }

  return { required: reasons.length > 0, reasons };
}
