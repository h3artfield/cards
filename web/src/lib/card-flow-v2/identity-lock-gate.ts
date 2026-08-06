import type {
  CardCategory,
  CardSuspect,
  CategoryDetectiveGuide,
  IdentityLockStatus,
  ImageEvidenceReport,
  LockedCardIdentity,
  SuspectAssessment,
} from "./types";
import { getSlotValue, isSlotUnknown } from "./evidence-utils";

const LOCK_SCORE_MIN = 0.9;
const LOCK_GAP_MIN = 0.12;
const VARIANT_UNCERTAINTY_MIN = 0.75;

type LockInput = {
  suspects: CardSuspect[];
  assessments: SuspectAssessment[];
  detectiveGuide: CategoryDetectiveGuide;
  imageEvidence: ImageEvidenceReport;
  category: CardCategory;
};

function mapGuideRequirementToEvidenceField(req: string): string[] {
  const r = req.toLowerCase();
  if (r.includes("name")) return ["card_name", "player_name"];
  if (r.includes("signature")) return ["riftbound_signature_type", "riftbound_signature_visible"];
  if (r.includes("overnumbered")) return ["riftbound_overnumbered"];
  if (r.includes("alternate-art") || r.includes("alt-art")) {
    return ["riftbound_alt_art", "riftbound_collector_suffix"];
  }
  if (r.includes("set code")) return ["set_code", "riftbound_set_code"];
  if (r.includes("set")) return ["set_name", "set_code"];
  if (r.includes("collector") || r.includes("card number")) {
    return ["collector_number", "card_number"];
  }
  if (r.includes("language")) return ["language"];
  if (r.includes("finish") || r.includes("foil") || r.includes("holo")) {
    return ["foil_pattern"];
  }
  if (r.includes("parallel")) return ["parallel_indicator"];
  if (r.includes("edition")) return ["edition"];
  if (r.includes("rarity")) return ["rarity"];
  if (r.includes("player")) return ["player_name"];
  if (r.includes("year")) return ["year"];
  if (r.includes("manufacturer")) return ["manufacturer"];
  if (r.includes("product")) return ["set_name"];
  if (r.includes("serial")) return ["serial_number"];
  if (r.includes("autograph")) return ["autograph"];
  if (r.includes("relic")) return ["relic_or_patch"];
  if (r.includes("grading") || r.includes("slab")) {
    return ["slab_company", "slab_grade"];
  }
  if (r.includes("grade context")) return ["slab_company", "slab_grade"];
  if (r.includes("cert")) return ["cert_number"];
  if (r.includes("promo")) return ["promo_stamp"];
  if (r.includes("frame") || r.includes("serialized")) {
    return ["foil_pattern", "promo_stamp"];
  }
  return [];
}

function checkRequiredEvidence(
  imageEvidence: ImageEvidenceReport,
  detectiveGuide: CategoryDetectiveGuide,
): { satisfied: boolean; missing: string[] } {
  const missing: string[] = [];

  for (const req of detectiveGuide.lockRequirements) {
    const fields = mapGuideRequirementToEvidenceField(req);
    if (!fields.length) continue;

    const anyObserved = fields.some(
      (f) => getSlotValue(imageEvidence, f) != null,
    );
    const allUnknown = fields.every((f) => isSlotUnknown(imageEvidence, f));

    if (!anyObserved && !allUnknown) {
      missing.push(req);
    } else if (allUnknown) {
      missing.push(req);
    }
  }

  return { satisfied: missing.length === 0, missing };
}

function suspectToLockedFields(suspect: CardSuspect): Partial<LockedCardIdentity> {
  return {
    canonicalName: suspect.canonicalName,
    marketProductName: suspect.label,
    catalogSource: suspect.catalogSource,
    catalogId: suspect.catalogId,
    setName: suspect.setName,
    setCode: suspect.setCode,
    cardNumber: suspect.cardNumber,
    collectorNumber: suspect.collectorNumber,
    language: suspect.language,
    rarity: suspect.rarity,
    finish: suspect.finish,
    edition: suspect.edition,
    variantTags: suspect.variantTags,
    gradingCompany: suspect.gradingCompany,
    grade: suspect.grade,
  };
}

function buildStaffMessage(
  status: IdentityLockStatus,
  top: SuspectAssessment | undefined,
  suspect: CardSuspect | undefined,
  missing: string[],
  variantRisks: string[],
  closeSuspects: SuspectAssessment[],
  guide?: CategoryDetectiveGuide,
): string {
  const formulaSuffix =
    guide?.identificationFormula && status !== "locked"
      ? `\n\nSafe lookup: ${guide.identificationFormula}`
      : "";

  switch (status) {
    case "locked":
      return `V2 Identity: Locked\nConfidence: ${((top?.matchScore ?? 0) * 100).toFixed(0)}%\nCard: ${suspect?.label ?? "Unknown"}\nReason: ${top?.reasoning ?? "Strong match with required evidence satisfied."}`;
    case "not_locked_variant_uncertainty": {
      const lines = closeSuspects.slice(0, 3).map(
        (a, i) => `${i + 1}. ${a.reasoning.split(".")[0]}`,
      );
      return (
        [
          "V2 Identity: Not Locked — Variant Uncertainty",
          suspect ? `Likely family: ${suspect.label}` : "",
          closeSuspects.length
            ? `Remaining suspects:\n${lines.join("\n")}`
            : "",
          missing.length ? `Missing evidence: ${missing.join(", ")}` : "",
          variantRisks.length
            ? `Variant risks: ${variantRisks.slice(0, 3).join("; ")}`
            : "",
        ]
          .filter(Boolean)
          .join("\n") + formulaSuffix
      );
    }
    case "not_locked_missing_required_evidence":
      return (
        `V2 Identity: Not Locked — Missing Required Evidence\nMissing: ${missing.join(", ")}\nTop suspect: ${suspect?.label ?? "none"} (${((top?.matchScore ?? 0) * 100).toFixed(0)}%)` +
        formulaSuffix
      );
    case "not_locked_no_candidates":
      return (
        "V2 Identity: Not Locked — No catalog candidates found. Staff should identify manually." +
        formulaSuffix
      );
    case "manual_review_recommended":
      return (
        `V2 Identity: Manual Review Recommended\n${top?.reasoning ?? "Slab mismatch, low confidence, or critical uncertainty."}\nMissing: ${missing.join(", ") || "none"}` +
        formulaSuffix
      );
    default:
      return (
        `V2 Identity: Not Locked — Low Confidence\nTop suspect: ${suspect?.label ?? "none"} (${((top?.matchScore ?? 0) * 100).toFixed(0)}%)` +
        formulaSuffix
      );
  }
}

export function runIdentityLockGate(input: LockInput): LockedCardIdentity {
  const active = input.assessments.filter((a) => !a.canEliminate);
  const sorted = [...active].sort((a, b) => b.matchScore - a.matchScore);
  const top = sorted[0];
  const second = sorted[1];
  const topSuspect = input.suspects.find((s) => s.suspectId === top?.suspectId);

  const { satisfied, missing } = checkRequiredEvidence(
    input.imageEvidence,
    input.detectiveGuide,
  );

  const unresolvedVariantRisks = [
    ...new Set(sorted.flatMap((a) => a.variantRisks)),
  ].slice(0, 8);

  const slabCompany = getSlotValue(input.imageEvidence, "slab_company");
  const hasSlabMismatch =
    Boolean(slabCompany) &&
    Boolean(topSuspect?.gradingCompany) &&
    slabCompany?.toLowerCase() !== topSuspect?.gradingCompany?.toLowerCase();

  const hasContradiction = (top?.contradictingEvidence.length ?? 0) > 0;

  let lockStatus: IdentityLockStatus;
  let locked = false;

  if (!input.suspects.length || !top) {
    lockStatus = "not_locked_no_candidates";
  } else if (
    input.imageEvidence.identificationMode === "manual_review" ||
    input.imageEvidence.identificationMode === "request_rescan" ||
    hasSlabMismatch ||
    (hasContradiction && (top.matchScore ?? 0) < 0.85)
  ) {
    lockStatus = "manual_review_recommended";
  } else if (!satisfied) {
    lockStatus = "not_locked_missing_required_evidence";
  } else if (
    top.matchScore >= LOCK_SCORE_MIN &&
    (!second || top.matchScore - second.matchScore >= LOCK_GAP_MIN) &&
    unresolvedVariantRisks.length === 0 &&
    !hasContradiction
  ) {
    lockStatus = "locked";
    locked = true;
  } else if (
    top.matchScore >= VARIANT_UNCERTAINTY_MIN &&
    second &&
    top.matchScore - second.matchScore < LOCK_GAP_MIN
  ) {
    lockStatus = "not_locked_variant_uncertainty";
  } else if (top.matchScore < VARIANT_UNCERTAINTY_MIN) {
    lockStatus = "not_locked_low_confidence";
  } else if (unresolvedVariantRisks.length > 0) {
    lockStatus = "not_locked_variant_uncertainty";
  } else {
    lockStatus = "not_locked_low_confidence";
  }

  const staffMessage = buildStaffMessage(
    lockStatus,
    top,
    topSuspect,
    missing,
    unresolvedVariantRisks,
    sorted.slice(0, 3),
    input.detectiveGuide,
  );

  const base: LockedCardIdentity = {
    locked,
    lockStatus,
    confidence: top?.matchScore ?? 0,
    category: input.category,
    requiredEvidenceSatisfied: satisfied,
    missingRequiredEvidence: missing,
    unresolvedVariantRisks,
    winningSuspectId: locked ? top?.suspectId : top?.suspectId,
    staffMessage,
    variantTags: topSuspect?.variantTags ?? [],
    certNumber: getSlotValue(input.imageEvidence, "cert_number") ?? undefined,
    ...(topSuspect ? suspectToLockedFields(topSuspect) : {}),
  };

  return base;
}
