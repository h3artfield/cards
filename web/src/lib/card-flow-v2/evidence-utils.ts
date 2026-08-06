import type {
  CardCategory,
  CardFlowV2EvidenceBundle,
  CardEvidenceInput,
  EvidenceSlot,
  ImageEvidenceReport,
} from "./types";
import type { VisionResult } from "../types";

export function getEvidenceSlot(
  report: ImageEvidenceReport,
  field: string,
): EvidenceSlot | undefined {
  return report.evidenceSlots.find((s) => s.field === field);
}

export function getSlotValue(
  report: ImageEvidenceReport,
  field: string,
): string | null {
  const slot = getEvidenceSlot(report, field);
  if (!slot || slot.status === "not_applicable") return null;
  if (slot.status === "unknown" || slot.status === "contradicted") return null;
  return slot.value?.trim() || null;
}

export function isSlotObserved(
  report: ImageEvidenceReport,
  field: string,
): boolean {
  const slot = getEvidenceSlot(report, field);
  return slot?.status === "observed" && Boolean(slot.value?.trim());
}

export function isSlotUnknown(
  report: ImageEvidenceReport,
  field: string,
): boolean {
  const slot = getEvidenceSlot(report, field);
  return !slot || slot.status === "unknown";
}

export function normalizeText(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

export function textMatches(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  const na = normalizeText(a);
  const nb = normalizeText(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  return na.includes(nb) || nb.includes(na);
}

export function numberMatches(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  if (!a || !b) return false;
  const clean = (s: string) => s.replace(/\s+/g, "").toLowerCase();
  const ca = clean(a);
  const cb = clean(b);
  if (ca === cb) return true;
  const numA = ca.split("/")[0]?.replace(/^0+/, "") ?? ca;
  const numB = cb.split("/")[0]?.replace(/^0+/, "") ?? cb;
  return numA === numB;
}

/** Map V2 category to legacy VisionResult category for catalog lookups. */
export function v2CategoryToLegacy(
  category: CardCategory,
): VisionResult["category"] {
  switch (category) {
    case "mtg":
      return "magic";
    case "pokemon":
    case "yugioh":
    case "sports":
      return category;
    default:
      return "other";
  }
}

/** Merge card-level hints when evidence slots are empty or unknown. */
export function mergeVisionHintFallback(
  vision: VisionResult,
  fallback?: Partial<VisionResult>,
): VisionResult {
  if (!fallback) return vision;
  return {
    ...vision,
    cardName: vision.cardName?.trim() || fallback.cardName?.trim() || "",
    setName: vision.setName?.trim() || fallback.setName?.trim() || undefined,
    setCode: vision.setCode?.trim() || fallback.setCode?.trim() || undefined,
    cardNumber: vision.cardNumber?.trim() || fallback.cardNumber?.trim() || undefined,
    playerName: vision.playerName?.trim() || fallback.playerName?.trim() || undefined,
  };
}
/** Build a VisionResult hint from extracted evidence for existing catalog helpers. */
export function evidenceToVisionHint(
  imageEvidence: ImageEvidenceReport,
  category: CardCategory,
  declaredItemType?: string,
): VisionResult {
  const cardName =
    getSlotValue(imageEvidence, "card_name") ??
    getSlotValue(imageEvidence, "name");
  const playerName = getSlotValue(imageEvidence, "player_name");
  const setName = getSlotValue(imageEvidence, "set_name");
  const setCode = getSlotValue(imageEvidence, "set_code");
  const cardNumber =
    getSlotValue(imageEvidence, "collector_number") ??
    getSlotValue(imageEvidence, "card_number");
  const slabCompany = getSlotValue(imageEvidence, "slab_company");
  const slabGrade = getSlotValue(imageEvidence, "slab_grade");

  const isGraded = Boolean(slabCompany && slabGrade);

  return {
    category: v2CategoryToLegacy(category),
    itemType: isGraded
      ? "graded"
      : declaredItemType === "graded"
        ? "graded"
        : "raw",
    cardName: cardName ?? playerName ?? "",
    setName: setName ?? undefined,
    setCode: setCode ?? undefined,
    cardNumber: cardNumber ?? undefined,
    playerName: playerName ?? undefined,
    brand: getSlotValue(imageEvidence, "manufacturer") ?? undefined,
    year: getSlotValue(imageEvidence, "year") ?? undefined,
    variant: getSlotValue(imageEvidence, "foil_pattern") ?? undefined,
    language: getSlotValue(imageEvidence, "language") ?? undefined,
    parallel: getSlotValue(imageEvidence, "parallel_indicator") ?? undefined,
    autograph: normalizeText(getSlotValue(imageEvidence, "autograph")) === "yes",
    relicPatch:
      normalizeText(getSlotValue(imageEvidence, "relic_or_patch")) === "yes",
    serialNumbered: Boolean(getSlotValue(imageEvidence, "serial_number")),
    slabCompany: slabCompany ?? undefined,
    slabGrade: slabGrade ?? undefined,
    slabCertNumber: getSlotValue(imageEvidence, "cert_number") ?? undefined,
    conditionEstimate: "LP",
    confidence: 0.6,
  };
}

export type IdentityV2Input = CardEvidenceInput & {
  evidence: CardFlowV2EvidenceBundle;
};

const CONFIDENT_THRESHOLD = 0.75;
const MICRO_VISION_CONFIRM_THRESHOLD = 0.85;

export function hasBottomCollectorLine(
  imageEvidence: ImageEvidenceReport,
): boolean {
  return Boolean(
    getSlotValue(imageEvidence, "collector_number") ??
      getSlotValue(imageEvidence, "card_number"),
  );
}

/** Set + collector number observed with enough confidence to narrow printings. */
export function hasHighConfidenceSetAndNumber(
  imageEvidence: ImageEvidenceReport,
): boolean {
  const setSlot = getEvidenceSlot(imageEvidence, "set_code");
  const numSlot =
    getEvidenceSlot(imageEvidence, "collector_number") ??
    getEvidenceSlot(imageEvidence, "card_number");

  const setVal =
    getSlotValue(imageEvidence, "set_code") ??
    getSlotValue(imageEvidence, "set_name");
  const numVal =
    getSlotValue(imageEvidence, "collector_number") ??
    getSlotValue(imageEvidence, "card_number");

  if (!setVal || !numVal) return false;

  const slotConfident = (slot: ReturnType<typeof getEvidenceSlot>) =>
    slot != null &&
    (slot.status === "observed" || slot.status === "inferred") &&
    slot.confidence >= CONFIDENT_THRESHOLD;

  return slotConfident(setSlot) && slotConfident(numSlot);
}

/** Whether a follow-up micro-vision / detective question is still needed. */
export function slotNeedsFollowUp(
  imageEvidence: ImageEvidenceReport,
  field: string,
  options?: { minConfidence?: number; rerunIfInferredNo?: boolean },
): boolean {
  const minConfidence = options?.minConfidence ?? 0.85;
  const slot = getEvidenceSlot(imageEvidence, field);
  if (microVisionResolvedSlot(imageEvidence, field)) return false;
  if (!slot || slot.status === "unknown" || slot.value == null) return true;
  if (slot.confidence < minConfidence) return true;
  if (options?.rerunIfInferredNo && slot.status === "inferred") {
    const v = normalizeText(slot.value);
    if (v === "no" || v === "false") return true;
  }
  return false;
}

export function microVisionResolvedSlot(
  imageEvidence: ImageEvidenceReport,
  field: string,
): boolean {
  const slot = getEvidenceSlot(imageEvidence, field);
  if (!slot?.note?.includes("micro-vision")) return false;
  return slot.confidence >= MICRO_VISION_CONFIRM_THRESHOLD;
}
