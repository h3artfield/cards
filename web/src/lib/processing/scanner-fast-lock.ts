import type { ScannedCard, VisionResult } from "../types";
import type {
  CardCandidateBundle,
  CardCategory as V2CardCategory,
  CardFlowV2EvidenceBundle,
  CardSuspect,
  EvidenceSlot,
  ImageEvidenceReport,
  SuspectAssessment,
} from "../card-flow-v2/types";
import { getDetectiveGuide } from "../card-flow-v2/detective-guides";
import { expectedEvidenceFromSuspect } from "../card-flow-v2/catalog-normalizers";

export function hasScannerCatalogLock(card: ScannedCard): boolean {
  return Boolean(
    card.catalogId?.trim() &&
      card.catalogSource &&
      card.detectedName?.trim(),
  );
}

function toV2Category(cat?: ScannedCard["category"], source?: ScannedCard["catalogSource"]): V2CardCategory {
  if (cat === "magic" || source === "scryfall") return "mtg";
  if (cat === "pokemon" || source === "pokemon_tcg") return "pokemon";
  if (cat === "yugioh" || source === "ygoprodeck") return "yugioh";
  if (cat === "sports") return "sports";
  return "unknown";
}

function toLegacyCategory(cat: V2CardCategory): VisionResult["category"] {
  if (cat === "mtg") return "magic";
  if (cat === "pokemon") return "pokemon";
  if (cat === "yugioh") return "yugioh";
  if (cat === "sports") return "sports";
  return "other";
}

export function buildScannerLockedVision(card: ScannedCard): VisionResult {
  const v2Cat = toV2Category(card.category, card.catalogSource);
  return {
    category: toLegacyCategory(v2Cat),
    itemType: card.itemType === "graded" ? "graded" : "raw",
    cardName: card.detectedName ?? "Unknown Card",
    setName: card.setName,
    setCode: card.setCode,
    cardNumber: card.cardNumber,
    conditionEstimate: card.conditionEstimate ?? "NM",
    autograph: false,
    relicPatch: false,
    serialNumbered: false,
    confidence: 0.96,
  };
}

export function buildScannerLockedV2Bundles(card: ScannedCard): {
  evidence: CardFlowV2EvidenceBundle;
  identity: CardCandidateBundle;
} {
  const now = new Date().toISOString();
  const category = toV2Category(card.category, card.catalogSource);
  const detectiveGuide = getDetectiveGuide(category);
  const catalogSource = card.catalogSource ?? "scryfall";
  const catalogId = card.catalogId!.trim();
  const finish =
    category === "mtg"
      ? "nonfoil"
      : category === "pokemon"
        ? "normal"
        : "default";

  const suspectId = `${catalogSource}:${catalogId}:${finish}`;
  const label = [
    card.detectedName,
    card.setName ?? card.setCode?.toUpperCase(),
    card.cardNumber ? `#${card.cardNumber}` : undefined,
  ]
    .filter(Boolean)
    .join(" · ");

  const suspect: CardSuspect = {
    suspectId,
    category,
    label: label || (card.detectedName ?? catalogId),
    canonicalName: card.detectedName,
    catalogSource,
    catalogId,
    setName: card.setName,
    setCode: card.setCode,
    collectorNumber: card.cardNumber,
    cardNumber: card.cardNumber,
    finish,
    variantTags: [finish],
    expectedEvidence: [],
    referenceImageUrls: card.frontImageUrl ? [card.frontImageUrl] : [],
  };
  suspect.expectedEvidence = expectedEvidenceFromSuspect(suspect);

  const slots: EvidenceSlot[] = [
    {
      field: "card_name",
      value: card.detectedName ?? null,
      status: "observed",
      confidence: 0.98,
      source: "front_image",
    },
    ...(card.setName
      ? [
          {
            field: "set_name",
            value: card.setName,
            status: "observed" as const,
            confidence: 0.96,
            source: "front_image" as const,
          },
        ]
      : []),
    ...(card.setCode
      ? [
          {
            field: "set_code",
            value: card.setCode,
            status: "observed" as const,
            confidence: 0.96,
            source: "front_image" as const,
          },
        ]
      : []),
    ...(card.cardNumber
      ? [
          {
            field: "collector_number",
            value: card.cardNumber,
            status: "observed" as const,
            confidence: 0.96,
            source: "front_image" as const,
          },
          {
            field: "card_number",
            value: card.cardNumber,
            status: "observed" as const,
            confidence: 0.96,
            source: "front_image" as const,
          },
        ]
      : []),
    {
      field: "foil_pattern",
      value: finish,
      status: "observed",
      confidence: 0.9,
      source: "front_image",
    },
  ];

  const imageEvidence: ImageEvidenceReport = {
    slots,
    imageQuality: {
      frontReadable: true,
      backReadable: false,
      backProvided: Boolean(card.backImageUrl?.trim()),
      glareLevel: "none",
      blurLevel: "none",
      cropComplete: true,
      qualityNotes: ["Instant on-device perceptual-hash lock"],
    },
    identificationMode: "direct_lock_candidate",
    summaryNotes: [
      `On-device live scanner matched ${suspect.label} (Hamming distance ${card.scanMatchDistance ?? 0}).`,
    ],
  };

  const assessment: SuspectAssessment = {
    suspectId,
    supportingEvidence: ["card_name", "set_name", "collector_number"],
    contradictingEvidence: [],
    missingEvidence: [],
    canEliminate: false,
    matchScore: 0.96,
    variantRisks: [],
    reasoning: "Instant perceptual-hash match against canonical scan index.",
  };

  const evidence: CardFlowV2EvidenceBundle = {
    ranAt: now,
    imageEvidence,
    categoryClassification: {
      category,
      confidence: 0.99,
      reasoning: "Locked by on-device scan index.",
    },
    detectiveGuide,
  };

  const identity: CardCandidateBundle = {
    category,
    suspects: [suspect],
    suspectAssessments: [assessment],
    lockedIdentity: {
      locked: true,
      lockStatus: "locked",
      confidence: 0.96,
      category,
      canonicalName: card.detectedName,
      marketProductName: suspect.label,
      catalogSource,
      catalogId,
      setName: card.setName,
      setCode: card.setCode,
      cardNumber: card.cardNumber,
      collectorNumber: card.cardNumber,
      finish,
      variantTags: [finish],
      requiredEvidenceSatisfied: true,
      missingRequiredEvidence: [],
      unresolvedVariantRisks: [],
      winningSuspectId: suspectId,
      staffMessage: `V2 Identity: Locked (Live Scanner)\nConfidence: 96%\nCard: ${suspect.label}`,
    },
    candidateGenerationNotes: [
      "Fast-path: pre-locked via on-device perceptual hash index.",
    ],
    createdAt: now,
  };

  return { evidence, identity };
}
