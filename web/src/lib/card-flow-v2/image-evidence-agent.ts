import type {
  CardEvidenceInput,
  DetectedSide,
  EvidenceSlot,
  EvidenceSource,
  EvidenceStatus,
  IdentificationMode,
  ImageEvidenceReport,
  ImageUsability,
  VisualProblem,
} from "./types";
import { callOpenAiJson } from "./openai-json";
import { buildCustomerImageContent } from "./vision-images";
import { MTG_IMAGE_EVIDENCE_RULES } from "./knowledge/mtg";
import { POKEMON_IMAGE_EVIDENCE_RULES } from "./knowledge/pokemon";
import { RIFTBOUND_IMAGE_EVIDENCE_RULES } from "./knowledge/riftbound";

const EVIDENCE_FIELD_NAMES = [
  "card_name",
  "set_name",
  "set_code",
  "card_number",
  "collector_number",
  "language",
  "rarity",
  "foil_pattern",
  "promo_stamp",
  "the_list_mark",
  "frameTreatment",
  "edition",
  "slab_company",
  "slab_grade",
  "cert_number",
  "player_name",
  "team",
  "year",
  "manufacturer",
  "serial_number",
  "autograph",
  "relic_or_patch",
  "parallel_indicator",
  "riftbound_collector_number",
  "riftbound_collector_suffix",
  "riftbound_signature_asterisk",
  "riftbound_signature_visible",
  "riftbound_signature_type",
  "riftbound_overnumbered",
  "riftbound_alt_art",
  "riftbound_ultimate",
  "riftbound_finish",
  "riftbound_set_code",
  "riftbound_product_source",
] as const;

const IMAGE_EVIDENCE_SCHEMA = `Return JSON only:
{
  "imageUsability": "excellent|good|limited|poor|unusable",
  "canAttemptIdentification": boolean,
  "canAutoLockIdentity": boolean,
  "detectedCardCount": number,
  "detectedSides": ["front"|"back"|"slab_front"|"slab_back"|"unknown"],
  "visualProblems": ["blur"|"glare"|"cut_off"|"too_dark"|"too_bright"|"angled"|"multiple_cards"|"low_resolution"|"sleeve_reflection"|"slab_label_unreadable"],
  "extractedText": string[],
  "evidenceSlots": [
    {
      "field": string,
      "value": string|null,
      "status": "observed"|"inferred"|"unknown"|"contradicted"|"not_applicable",
      "confidence": number,
      "source": "front_image"|"back_image"|"slab_label"|"ocr"|"catalog_match"|"market_title"|"staff_input",
      "note": string|null
    }
  ],
  "missingCriticalEvidence": string[],
  "identificationMode": "safe_to_continue"|"continue_with_variant_uncertainty"|"candidate_list_only"|"manual_review"|"request_rescan",
  "staffMessage": string,
  "customerMessage": string|null
}`;

const IMAGE_EVIDENCE_SYSTEM = `You are a trading-card image evidence detective.

Your job is NOT to price the card and NOT to force a final exact market identity.

Your job is to inspect the provided customer images and extract visible evidence only.

Customers may submit imperfect photos — blurry, angled, dim, or glare-heavy. Do not reject a photo just because of quality issues. Continue if useful evidence is still visible.

Rules:
- Never guess required fields. If a field is not visible, mark status "unknown" and value null.
- Use "not_applicable" when a field does not apply to this card type.
- Use "observed" only when you can directly see the value in the image.
- Use "inferred" sparingly when strongly implied but not literally readable.
- Do NOT search eBay, PriceCharting, or any market source.
- Do NOT output prices or market values.
- Do NOT pick a single definitive catalog product when variant-critical evidence is missing.
- canAutoLockIdentity should be false unless all critical identity fields for this card type are clearly observed.
- If foil/parallel/promo treatment is unclear, set identificationMode to "continue_with_variant_uncertainty" or "candidate_list_only".

Pokémon reverse holo vs normal (when both exist for the same collector number):
${POKEMON_IMAGE_EVIDENCE_RULES}

Magic: The Gathering foil vs nonfoil (when both exist for the same printing):
${MTG_IMAGE_EVIDENCE_RULES}

Riftbound (League of Legends TCG) — collector number suffix, overnumbered, and signature markers:
${RIFTBOUND_IMAGE_EVIDENCE_RULES}

- If multiple cards appear, set detectedCardCount accordingly and prefer manual_review.
- If truly nothing useful is visible, use identificationMode "request_rescan" but still list whatever partial evidence exists.

Populate evidenceSlots for applicable fields from this list (skip or mark not_applicable when irrelevant):
${EVIDENCE_FIELD_NAMES.join(", ")}

${IMAGE_EVIDENCE_SCHEMA}`;

type RawImageEvidence = Partial<ImageEvidenceReport> & {
  evidenceSlots?: Array<Partial<EvidenceSlot>>;
};

const USABILITY: ImageUsability[] = [
  "excellent",
  "good",
  "limited",
  "poor",
  "unusable",
];
const ID_MODES: IdentificationMode[] = [
  "safe_to_continue",
  "continue_with_variant_uncertainty",
  "candidate_list_only",
  "manual_review",
  "request_rescan",
];
const SIDES: DetectedSide[] = [
  "front",
  "back",
  "slab_front",
  "slab_back",
  "unknown",
];
const STATUSES: EvidenceStatus[] = [
  "observed",
  "inferred",
  "unknown",
  "contradicted",
  "not_applicable",
];
const SOURCES: EvidenceSource[] = [
  "front_image",
  "back_image",
  "slab_label",
  "ocr",
  "catalog_match",
  "market_title",
  "staff_input",
];
const PROBLEMS: VisualProblem[] = [
  "blur",
  "glare",
  "cut_off",
  "too_dark",
  "too_bright",
  "angled",
  "multiple_cards",
  "low_resolution",
  "sleeve_reflection",
  "slab_label_unreadable",
];

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

function pickEnum<T extends string>(value: unknown, allowed: T[], fallback: T): T {
  return typeof value === "string" && allowed.includes(value as T)
    ? (value as T)
    : fallback;
}

function normalizeSlot(raw: Partial<EvidenceSlot>): EvidenceSlot {
  return {
    field: String(raw.field ?? "unknown"),
    value:
      raw.value === null || raw.value === undefined
        ? null
        : String(raw.value),
    status: pickEnum(raw.status, STATUSES, "unknown"),
    confidence: clamp01(Number(raw.confidence) || 0),
    source: pickEnum(raw.source, SOURCES, "front_image"),
    note: raw.note?.trim() || undefined,
  };
}

/** Normalize and validate model output into a strict ImageEvidenceReport. */
export function parseImageEvidenceResponse(raw: RawImageEvidence): ImageEvidenceReport {
  const slots = (raw.evidenceSlots ?? []).map(normalizeSlot);
  const usability = pickEnum(raw.imageUsability, USABILITY, "limited");
  const mode = pickEnum(raw.identificationMode, ID_MODES, "manual_review");

  const canAttempt =
    typeof raw.canAttemptIdentification === "boolean"
      ? raw.canAttemptIdentification
      : usability !== "unusable";

  const canAutoLock =
    typeof raw.canAutoLockIdentity === "boolean"
      ? raw.canAutoLockIdentity
      : false;

  return {
    imageUsability: usability,
    canAttemptIdentification: canAttempt,
    canAutoLockIdentity: canAutoLock,
    detectedCardCount: Math.max(
      0,
      Math.round(Number(raw.detectedCardCount) || (canAttempt ? 1 : 0)),
    ),
    detectedSides: (raw.detectedSides ?? ["front"])
      .map((s) => pickEnum(s, SIDES, "unknown"))
      .filter((s, i, arr) => arr.indexOf(s) === i),
    visualProblems: (raw.visualProblems ?? [])
      .map((p) => pickEnum(p, PROBLEMS, "blur"))
      .filter((p, i, arr) => arr.indexOf(p) === i),
    extractedText: Array.isArray(raw.extractedText)
      ? raw.extractedText.map(String).slice(0, 40)
      : [],
    evidenceSlots: slots,
    missingCriticalEvidence: Array.isArray(raw.missingCriticalEvidence)
      ? raw.missingCriticalEvidence.map(String).slice(0, 20)
      : [],
    identificationMode: mode,
    staffMessage:
      raw.staffMessage?.trim() ||
      "Evidence extraction complete — review slots and missing fields.",
    customerMessage: raw.customerMessage?.trim() || undefined,
  };
}

export async function runImageEvidenceAgent(
  input: CardEvidenceInput,
  options?: { category?: string; extraInstructions?: string },
): Promise<ImageEvidenceReport> {
  const intro = [
    options?.extraInstructions?.trim(),
    "Extract visible trading-card evidence from these customer photos.",
  ]
    .filter(Boolean)
    .join("\n\n");

  const userContent = buildCustomerImageContent(input, intro);

  const model =
    process.env.OPENAI_VISION_MODEL ??
    process.env.OPENAI_EVIDENCE_MODEL ??
    "gpt-4o";

  const raw = await callOpenAiJson<RawImageEvidence>(
    IMAGE_EVIDENCE_SYSTEM,
    userContent,
    { model, maxTokens: 1400, temperature: 0.15 },
  );

  return parseImageEvidenceResponse(raw);
}
